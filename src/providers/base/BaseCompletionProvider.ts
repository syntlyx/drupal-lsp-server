import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DrupalService } from '../../parsers/YamlServiceParser';
import { getYamlServiceParser } from '../../server';
import { ICompletionProvider } from '../ICompletionProvider';
import { BaseServiceNameExtractor } from './BaseServiceNameExtractor';
import { BaseServiceProvider } from './BaseServiceProvider';

/**
 * Base Completion Provider
 * Shared logic for service name autocomplete across languages
 */
export abstract class BaseCompletionProvider extends BaseServiceProvider implements ICompletionProvider {
  protected extractor: BaseServiceNameExtractor;

  protected constructor(extractor: BaseServiceNameExtractor) {
    super();
    this.extractor = extractor;
  }

  abstract canProvide(document: TextDocument, position: Position): boolean;

  /**
   * Main completion logic - override if needed for language-specific behavior
   */
  async provideCompletions(document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });

    // Check if we're in service context
    if (!this.isServiceCompletionContext(line, position)) {
      return [];
    }

    // Get typed text for smart sorting
    const typedText = this.getTypedText(line, position);

    // Get valid services
    const parser = getYamlServiceParser();
    const allServices = parser.getAllServices();
    const validServices = this.filterValidServices(allServices);

    // Build completion items
    return this.buildCompletionItems(validServices, typedText, document, position);
  }

  /**
   * Check if we're in a context where service completion should trigger
   */
  protected abstract isServiceCompletionContext(line: string, position: Position): boolean;

  /**
   * Extract typed text for smart sorting
   */
  protected abstract getTypedText(line: string, position: Position): string;

  /**
   * Build completion items from services
   * Can be overridden for language-specific formatting (e.g., @ prefix in YAML)
   */
  protected buildCompletionItems(
    services: DrupalService[],
    typedText: string,
    _document: TextDocument,
    _position: Position
  ): CompletionItem[] {
    return services.map((service) => {
      const detail = this.buildServiceDetail(service);
      const sortPrefix = this.getSortPrefix(service.sourceType);

      // Smart sorting: prioritize prefix matches
      const matchScore = this.calculateMatchScore(service.name, typedText, sortPrefix);

      return {
        label: service.name,
        kind: CompletionItemKind.Reference,
        detail: detail,
        documentation: this.buildServiceDocumentation(service),
        sortText: matchScore,
        filterText: service.name
      };
    });
  }

  /**
   * Calculate match score for sorting
   */
  protected calculateMatchScore(serviceName: string, typedText: string, sortPrefix: string): string {
    if (!typedText) return sortPrefix + serviceName;

    if (serviceName.startsWith(typedText)) {
      // Exact prefix match - prioritize by remaining length
      const remainingLength = serviceName.length - typedText.length;
      const matchQuality = String(remainingLength).padStart(3, '0');
      return '0_' + matchQuality + '_' + sortPrefix + serviceName;
    } else if (serviceName.includes(typedText)) {
      // Contains match - lower priority
      return '1_' + sortPrefix + serviceName;
    } else {
      // No match - lowest priority
      return '2_' + sortPrefix + serviceName;
    }
  }
}
