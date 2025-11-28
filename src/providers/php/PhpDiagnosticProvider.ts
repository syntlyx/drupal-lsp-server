import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver';
import { IDiagnosticProvider } from '../IDiagnosticProvider';
import { BaseDiagnosticProvider } from '../base/BaseDiagnosticProvider';
import { getPhpCsProvider, getYamlRouteParser } from '../../server';

/**
 * PHP Diagnostic Provider
 * Validates service names and routes in DI container calls and PHPCS diagnostics
 */
export class PhpDiagnosticProvider extends BaseDiagnosticProvider implements IDiagnosticProvider {
  constructor() {
    super();
  }

  canProvide(document: TextDocument): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Service name validation
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const serviceMatches = this.extractServiceCalls(line);

      for (const match of serviceMatches) {
        if (!this.serviceExists(match.serviceName)) {
          diagnostics.push(
            this.createServiceNotFoundDiagnostic(
              lineNum,
              match.start,
              match.end,
              match.serviceName
            )
          );
        }
      }

      // Route validation
      const routeMatches = this.extractRouteCalls(line);
      for (const match of routeMatches) {
        // Check if route exists first
        const exists = this.routeExists(match.routeName);

        // If it exists, no error
        if (exists) {
          continue;
        }

        // If it doesn't exist but it's a dynamic route pattern, skip validation
        // (e.g., view.custom_view.page_1 might not be indexed)
        if (this.isDynamicRoutePattern(match.routeName)) {
          continue;
        }

        // Route doesn't exist and it's not a known dynamic pattern - show error
        diagnostics.push(
          this.createRouteNotFoundDiagnostic(
            lineNum,
            match.start,
            match.end,
            match.routeName
          )
        );
      }
    }

    // PHPCS diagnostics
    try {
      const phpCsProvider = getPhpCsProvider();
      if (phpCsProvider && phpCsProvider.isEnabled()) {
        const phpCsDiagnostics = await phpCsProvider.getDiagnostics(document);
        diagnostics.push(...phpCsDiagnostics);
      }
    } catch {
      // Silently ignore phpcs errors
    }

    return diagnostics;
  }

  /**
   * Extract all service calls from line
   */
  private extractServiceCalls(line: string): Array<{ serviceName: string; start: number; end: number }> {
    const results: Array<{ serviceName: string; start: number; end: number }> = [];

    // Pattern 1: ::service('service_name') - closing quote optional
    const servicePattern = /::service\s*\(\s*['"]([a-z0-9._]+)['"]?/gi;
    let match;

    while ((match = servicePattern.exec(line)) !== null) {
      const serviceName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(serviceName);
      const end = start + serviceName.length;

      results.push({ serviceName, start, end });
    }

    // Pattern 2: ->get('service_name') - closing quote optional
    const getPattern = /(?:\$this|\$container|\$this->container)->get\s*\(\s*['"]([a-z0-9._]+)['"]?/gi;

    while ((match = getPattern.exec(line)) !== null) {
      const serviceName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(serviceName);
      const end = start + serviceName.length;

      results.push({ serviceName, start, end });
    }

    return results;
  }

  /**
   * Extract all route calls from line
   */
  private extractRouteCalls(line: string): Array<{ routeName: string; start: number; end: number }> {
    const results: Array<{ routeName: string; start: number; end: number }> = [];

    // Pattern 1: Url::fromRoute('route_name', ...) - may have params after
    const urlPattern = /Url::fromRoute\s*\(\s*['"]([a-z0-9._]+)/gi;
    let match;

    while ((match = urlPattern.exec(line)) !== null) {
      const routeName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(routeName);
      const end = start + routeName.length;

      results.push({ routeName, start, end });
    }

    // Pattern 2: $this->redirect('route_name', ...) or $this->setRedirect('route_name', ...)
    const redirectPattern = /(?:\$this|\$response|\$form_state)->(?:redirect|setRedirect)\s*\(\s*['"]([a-z0-9._]+)/gi;

    while ((match = redirectPattern.exec(line)) !== null) {
      const routeName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(routeName);
      const end = start + routeName.length;

      results.push({ routeName, start, end });
    }

    // Pattern 3: Link::createFromRoute('title', 'route_name', ...)
    const linkPattern = /Link::createFromRoute\s*\([^,]+,\s*['"]([a-z0-9._]+)/gi;

    while ((match = linkPattern.exec(line)) !== null) {
      const routeName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(routeName);
      const end = start + routeName.length;

      results.push({ routeName, start, end });
    }

    return results;
  }

  private routeExists(routeName: string): boolean {
    const routeParser = getYamlRouteParser();
    if (!routeParser) return true; // Skip validation if parser not available

    const availableRoutes = new Set(routeParser.getAllRouteNames());
    return availableRoutes.has(routeName);
  }

  /**
   * Check if route is a dynamic route pattern that we can't validate
   * Only returns true for routes that START with dynamic prefix but are NOT in our known routes
   * This is more permissive - we only skip validation if it looks like a custom dynamic route
   */
  private isDynamicRoutePattern(routeName: string): boolean {
    const dynamicPrefixes = [
      'view.',           // Custom views - view.my_view.page_1
      'rest.',           // REST resources
      'jsonapi.',        // JSON:API resources
      'layout_builder.', // Layout builder
      'field_ui.'       // Field UI
    ];

    // Check if it matches a dynamic pattern
    // Note: entity.* routes are NOT in this list because we have common entity routes
    // If entity.node.canonical is misspelled (entity.node.canonicals), we WANT to show an error
    return dynamicPrefixes.some((prefix) => routeName.startsWith(prefix));
  }

  private createRouteNotFoundDiagnostic(
    line: number,
    startChar: number,
    endChar: number,
    routeName: string
  ): Diagnostic {
    return {
      severity: 1, // Error
      range: {
        start: { line, character: startChar },
        end: { line, character: endChar }
      },
      message: `Route '${routeName}' not found`,
      source: 'drupal-lsp'
    };
  }
}
