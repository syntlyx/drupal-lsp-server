import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItem, TextEdit, Range } from 'vscode-languageserver';
import { BaseCompletionProvider } from '../base/BaseCompletionProvider';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { PhpRouteNameExtractor } from './PhpRouteNameExtractor';
import { DrupalService } from '../../parsers/YamlServiceParser';
import { getYamlRouteParser } from '../../server';

/**
 * PHP Completion Provider
 * Provides autocomplete for service names and routes in DI calls
 */
export class PhpCompletionProvider extends BaseCompletionProvider {
  private routeExtractor: PhpRouteNameExtractor;

  constructor() {
    super(new PhpServiceNameExtractor());
    this.routeExtractor = new PhpRouteNameExtractor();
  }

  canProvide(document: TextDocument): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  async provideCompletions(document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    // Check for route completion
    if (this.routeExtractor.isRouteContext(line)) {
      return this.getRouteCompletions(document, position);
    }

    // Service completion (default behavior)
    return super.provideCompletions(document, position);
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

  private getRouteCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const routeParser = getYamlRouteParser();
    if (!routeParser) return [];

    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    const typedText = this.routeExtractor.getTypedRoute(line, position.character);
    const allRoutes = routeParser.getAllRoutes();

    // Find quote position for textEdit
    let quoteStart = -1;
    for (let i = position.character - 1; i >= 0; i--) {
      if (line[i] === "'" || line[i] === '"') {
        quoteStart = i;
        break;
      }
    }

    if (quoteStart < 0) return [];

    const replaceRange = Range.create(
      position.line,
      quoteStart + 1,
      position.line,
      position.character
    );

    return this.allRoutesCompletions(allRoutes, replaceRange, typedText);
  }
}
