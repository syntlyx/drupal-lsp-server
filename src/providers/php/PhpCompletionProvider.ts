import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItem, TextEdit, Range } from 'vscode-languageserver';
import { BaseCompletionProvider } from '../base/BaseCompletionProvider';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { DrupalService } from '../../parsers/YamlServiceParser';

/**
 * PHP Completion Provider
 * Provides autocomplete for service names in DI calls
 */
export class PhpCompletionProvider extends BaseCompletionProvider {
  constructor() {
    super(new PhpServiceNameExtractor());
  }

  canProvide(document: TextDocument): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  protected isServiceCompletionContext(line: string): boolean {
    return this.getServiceCallInfo(line) !== null;
  }

  protected getTypedText(line: string): string {
    const callInfo = this.getServiceCallInfo(line);
    if (!callInfo) return '';
    return line.substring(callInfo.quoteStart + 1).trim();
  }

  protected buildCompletionItems(
    services: DrupalService[],
    typedText: string,
    document: TextDocument,
    position: Position
  ): CompletionItem[] {
    const callInfo = this.getServiceCallInfo(
      document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
      })
    );

    if (!callInfo) return [];

    // Build replace range
    const replaceRange = Range.create(
      position.line,
      callInfo.quoteStart + 1,
      position.line,
      position.character
    );

    return services.map((service) => {
      const detail = this.buildServiceDetail(service);
      const sortPrefix = this.getSortPrefix(service.sourceType);
      const matchScore = this.calculateMatchScore(service.name, typedText, sortPrefix);

      return {
        label: service.name,
        kind: 15, // CompletionItemKind.Reference
        detail: detail,
        documentation: this.buildServiceDocumentation(service),
        sortText: matchScore,
        textEdit: TextEdit.replace(replaceRange, service.name),
        filterText: service.name
      };
    });
  }

  /**
   * Get service call info including quote position
   */
  private getServiceCallInfo(line: string): { quoteStart: number } | null {
    // Pattern 1: ::service('
    let pattern = /::service\s*\(\s*['"][^'"]*$/;
    let match = line.match(pattern);

    if (match) {
      const quoteChar = line.includes("'") ? "'" : '"';
      return { quoteStart: line.lastIndexOf(quoteChar) };
    }

    // Pattern 2: ->get('
    pattern = /(?:\$this|\$container|\$this->container)->get\s*\(\s*['"][^'"]*$/;
    match = line.match(pattern);

    if (match) {
      const quoteChar = line.includes("'") ? "'" : '"';
      return { quoteStart: line.lastIndexOf(quoteChar) };
    }

    return null;
  }
}
