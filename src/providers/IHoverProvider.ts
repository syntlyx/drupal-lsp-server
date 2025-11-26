import { Hover, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Base interface for hover providers
 */
export interface IHoverProvider {
  /**
   * Check if this provider can handle the given document and position
   */
  canProvide(document: TextDocument, position: Position): boolean;

  /**
   * Provide hover information
   */
  provideHover(
    document: TextDocument,
    position: Position
  ): Promise<Hover | null>;
}
