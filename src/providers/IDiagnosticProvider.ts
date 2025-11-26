import { Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Base interface for diagnostic providers (linting)
 */
export interface IDiagnosticProvider {
  /**
   * Check if this provider can handle the given document
   */
  canProvide(document: TextDocument): boolean;

  /**
   * Provide diagnostics for the document
   */
  provideDiagnostics(document: TextDocument): Promise<Diagnostic[]>;
}
