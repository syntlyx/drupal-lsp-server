import { Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IDiagnosticProvider } from '../IDiagnosticProvider';
import { BaseDiagnosticProvider } from '../base/BaseDiagnosticProvider';
import { getYamlRouteParser, getYamlLinkParser } from '../../server';

/**
 * YAML Diagnostic Provider
 * Validates service and route references in YAML files
 */
export class YamlDiagnosticProvider extends BaseDiagnosticProvider implements IDiagnosticProvider {
  constructor() {
    super();
  }

  canProvide(document: TextDocument): boolean {
    const uri = document.uri;
    return uri.endsWith('.services.yml') || uri.endsWith('.links.task.yml') ||
      uri.endsWith('.links.menu.yml') || uri.endsWith('.links.action.yml') ||
      uri.endsWith('.links.contextual.yml');
  }

  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const uri = document.uri;

    // Service validation for .services.yml files
    if (uri.endsWith('.services.yml')) {
      diagnostics.push(...this.validateServices(document));
    }

    // Route, parent, and appears_on validation for links.*.yml files
    if (uri.includes('.links.')) {
      diagnostics.push(...this.validateRoutes(document));
      diagnostics.push(...this.validateParentLinks(document));
      diagnostics.push(...this.validateAppearsOn(document));
    }

    return diagnostics;
  }

  private validateServices(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    const availableServices = this.getAllServiceNames();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check parent: references
      const parentMatch = line.match(/^\s*parent:\s*['"]?([a-zA-Z0-9_.]+)['"]?\s*$/);
      if (parentMatch) {
        const serviceName = parentMatch[1];
        if (!availableServices.has(serviceName)) {
          const startChar = line.indexOf(serviceName);
          diagnostics.push(
            this.createServiceNotFoundDiagnostic(
              i,
              startChar,
              startChar + serviceName.length,
              serviceName
            )
          );
        }
      }

      // Check @service references in arguments
      const argMatches = line.matchAll(/@([a-zA-Z0-9_.]+)/g);
      for (const match of argMatches) {
        const serviceName = match[1];
        if (!availableServices.has(serviceName)) {
          const startChar = line.indexOf(match[0]);
          diagnostics.push(
            this.createServiceNotFoundDiagnostic(
              i,
              startChar,
              startChar + match[0].length,
              serviceName
            )
          );
        }
      }
    }

    return diagnostics;
  }

  private validateRoutes(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const routeParser = getYamlRouteParser();
    if (!routeParser) return diagnostics;

    const text = document.getText();
    const lines = text.split('\n');
    const availableRoutes = new Set(routeParser.getAllRouteNames());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check route: and route_name: references
      const routeMatch = line.match(/^\s*(?:route_name|route|base_route):\s*['"]?([a-zA-Z0-9_.]+)['"]?\s*$/);
      if (routeMatch) {
        const routeName = routeMatch[1];

        // Check if route exists first
        const exists = availableRoutes.has(routeName);

        // If it exists, no error
        if (exists) {
          continue;
        }

        // If it doesn't exist but it's a dynamic route pattern, skip validation
        if (this.isDynamicRoutePattern(routeName)) {
          continue;
        }

        // Route doesn't exist and it's not a known dynamic pattern - show error
        const startChar = line.indexOf(routeName);
        diagnostics.push(
          this.createRouteNotFoundDiagnostic(
            i,
            startChar,
            startChar + routeName.length,
            routeName
          )
        );
      }
    }

    return diagnostics;
  }

  /**
   * Check if route is a dynamic route pattern that we can't validate
   * More permissive - only skip validation for truly dynamic patterns
   */
  private isDynamicRoutePattern(routeName: string): boolean {
    const dynamicPrefixes = [
      'view.',
      'rest.',
      'jsonapi.',
      'layout_builder.',
      'field_ui.'
    ];

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

  private validateParentLinks(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const linkParser = getYamlLinkParser();
    if (!linkParser) return diagnostics;

    const text = document.getText();
    const lines = text.split('\n');
    const availableLinks = new Set(linkParser.getAllLinkNames());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check parent: references
      const parentMatch = line.match(/^\s*parent:\s*['"]?([a-zA-Z0-9_.]+)['"]?\s*$/);
      if (parentMatch) {
        const parentName = parentMatch[1];
        if (!availableLinks.has(parentName)) {
          const startChar = line.indexOf(parentName);
          diagnostics.push(
            this.createParentLinkNotFoundDiagnostic(
              i,
              startChar,
              startChar + parentName.length,
              parentName
            )
          );
        }
      }
    }

    return diagnostics;
  }

  private createParentLinkNotFoundDiagnostic(
    line: number,
    startChar: number,
    endChar: number,
    parentName: string
  ): Diagnostic {
    return {
      severity: 1, // Error
      range: {
        start: { line, character: startChar },
        end: { line, character: endChar }
      },
      message: `Parent link '${parentName}' not found`,
      source: 'drupal-lsp'
    };
  }

  /**
   * Validate appears_on route references in links files
   */
  private validateAppearsOn(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const routeParser = getYamlRouteParser();
    if (!routeParser) return diagnostics;

    const text = document.getText();
    const lines = text.split('\n');
    const availableRoutes = new Set(routeParser.getAllRouteNames());

    let inAppearsOn = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're entering appears_on section
      if (/^\s*appears_on:\s*$/.test(line)) {
        inAppearsOn = true;
        continue;
      }

      // Check if we exited appears_on (new key at same or lower indent level)
      if (inAppearsOn && /^\s*[a-z_]+:\s*/.test(line) && !line.trim().startsWith('-')) {
        inAppearsOn = false;
      }

      // Validate route names in appears_on list
      if (inAppearsOn) {
        // Match list items: "- route.name" or "- 'route.name'"
        const listMatch = line.match(/^\s*-\s*['"]?([a-zA-Z0-9_.]+)['"]?\s*$/);
        if (listMatch) {
          const routeName = listMatch[1];
          
          // Check if route exists
          const exists = availableRoutes.has(routeName);
          
          if (exists) {
            continue;
          }

          // If doesn't exist but it's dynamic, skip
          if (this.isDynamicRoutePattern(routeName)) {
            continue;
          }

          // Show error
          const startChar = line.indexOf(routeName);
          diagnostics.push({
            severity: 1,
            range: {
              start: { line: i, character: startChar },
              end: { line: i, character: startChar + routeName.length }
            },
            message: `Route '${routeName}' not found in appears_on`,
            source: 'drupal-lsp'
          });
        }
      }
    }

    return diagnostics;
  }
}
