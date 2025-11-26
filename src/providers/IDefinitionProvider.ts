import { Definition, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Base interface for definition providers (go-to-definition)
 */
export interface IDefinitionProvider {
  /**
   * Check if this provider can handle the given document and position
   */
  canProvide(document: TextDocument, position: Position): boolean;

  /**
   * Provide definition location(s)
   */
  provideDefinition(
    document: TextDocument,
    position: Position,
  ): Promise<Definition | null>;
}
