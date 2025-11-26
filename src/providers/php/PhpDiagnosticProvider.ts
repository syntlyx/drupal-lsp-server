import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver';
import { IDiagnosticProvider } from '../IDiagnosticProvider';
import { BaseDiagnosticProvider } from '../base/BaseDiagnosticProvider';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { getPhpCsProvider } from '../../server';

/**
 * PHP Diagnostic Provider
 * Validates service names in DI container calls + PHPCS diagnostics
 */
export class PhpDiagnosticProvider extends BaseDiagnosticProvider implements IDiagnosticProvider {
  private extractor: PhpServiceNameExtractor;

  constructor() {
    super();
    this.extractor = new PhpServiceNameExtractor();
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
      const matches = this.extractServiceCalls(line);

      for (const match of matches) {
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
    }

    // PHPCS diagnostics
    try {
      const phpCsProvider = getPhpCsProvider();
      if (phpCsProvider && phpCsProvider.isEnabled()) {
        const phpCsDiagnostics = await phpCsProvider.getDiagnostics(document);
        diagnostics.push(...phpCsDiagnostics);
      }
    } catch (error) {
      // Silently ignore phpcs errors
    }

    return diagnostics;
  }

  /**
   * Extract all service calls from line
   */
  private extractServiceCalls(line: string): Array<{ serviceName: string; start: number; end: number }> {
    const results: Array<{ serviceName: string; start: number; end: number }> = [];

    // Pattern 1: ::service('service_name')
    const servicePattern = /::service\s*\(\s*['"]([a-z0-9._]+)['"]/gi;
    let match;

    while ((match = servicePattern.exec(line)) !== null) {
      const serviceName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(serviceName);
      const end = start + serviceName.length;

      results.push({ serviceName, start, end });
    }

    // Pattern 2: ->get('service_name')
    const getPattern = /(?:\$this|\$container|\$this->container)->get\s*\(\s*['"]([a-z0-9._]+)['"]/gi;

    while ((match = getPattern.exec(line)) !== null) {
      const serviceName = match[1];
      const fullMatch = match[0];
      const start = match.index + fullMatch.indexOf(serviceName);
      const end = start + serviceName.length;

      results.push({ serviceName, start, end });
    }

    return results;
  }
}
