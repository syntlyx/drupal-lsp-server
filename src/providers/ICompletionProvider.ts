import { CompletionItem, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Base interface for completion providers
 */
export interface ICompletionProvider {
  /**
   * Check if this provider can handle the given document and position
   */
  canProvide(document: TextDocument, position: Position): boolean;

  /**
   * Provide completion items
   */
  provideCompletions(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[]>;
}
