import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { getYamlServiceParser } from '../../server';

/**
 * Base Diagnostic Provider
 * Common utilities for validating service references
 */
export abstract class BaseDiagnosticProvider {
  /**
   * Check if service exists in registry
   */
  protected serviceExists(serviceName: string): boolean {
    const parser = getYamlServiceParser();
    const service = parser.getService(serviceName);
    return service !== null;
  }

  /**
   * Create diagnostic for non-existent service
   */
  protected createServiceNotFoundDiagnostic(
    line: number,
    start: number,
    end: number,
    serviceName: string
  ): Diagnostic {
    return {
      severity: DiagnosticSeverity.Error,
      range: Range.create(line, start, line, end),
      message: `Service '${serviceName}' not found`,
      source: 'drupal-lsp'
    };
  }

  /**
   * Get all available service names as Set for fast lookup
   */
  protected getAllServiceNames(): Set<string> {
    const parser = getYamlServiceParser();
    const names = parser.getAllServiceNames();
    return new Set(names);
  }
}
