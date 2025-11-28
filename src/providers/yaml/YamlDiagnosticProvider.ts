import { Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IDiagnosticProvider } from '../IDiagnosticProvider';
import { BaseDiagnosticProvider } from '../base/BaseDiagnosticProvider';

/**
 * YAML Diagnostic Provider
 * Validates service references in .services.yml files
 */
export class YamlDiagnosticProvider extends BaseDiagnosticProvider implements IDiagnosticProvider {
  constructor() {
    super();
  }

  canProvide(document: TextDocument): boolean {
    const uri = document.uri;
    return uri.endsWith('.services.yml');
  }

  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
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
}
