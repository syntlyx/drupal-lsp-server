import {CompletionItem, CompletionItemKind, Position, Range, TextEdit} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DrupalService } from '../../parsers/YamlServiceParser';
import { getYamlServiceParser } from '../../server';
import { ICompletionProvider } from '../ICompletionProvider';
import { BaseServiceNameExtractor } from './BaseServiceNameExtractor';
import { BaseServiceProvider } from './BaseServiceProvider';
import {DrupalRoute} from '../../parsers/YamlRouteParser';

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

  protected calculateRouteMatchScore(routeName: string, typed: string, sortPrefix: string): string {
    if (!typed) return `${sortPrefix}_${routeName}`;

    const lowerRoute = routeName.toLowerCase();
    const lowerTyped = typed.toLowerCase();

    if (lowerRoute === lowerTyped) return `${sortPrefix}_0_${routeName}`;
    if (lowerRoute.startsWith(lowerTyped)) {
      const remaining = routeName.length - typed.length;
      return `${sortPrefix}_1_${remaining.toString().padStart(5, '0')}_${routeName}`;
    }

    return `${sortPrefix}_2_${routeName}`;
  }

  protected allRoutesCompletions(routes: DrupalRoute[], replaceRange: Range, typedText: string): CompletionItem[] {
    return routes
      .filter((route) => route.name.toLowerCase().includes(typedText.toLowerCase()))
      .map((route) => {
        const detail = route.sourceType ? `[${route.sourceType}] ${route.path || ''}` : route.path;
        const sortPrefix = route.sourceType === 'custom' ? '0' : route.sourceType === 'contrib' ? '1' : '2';
        const matchScore = this.calculateRouteMatchScore(route.name, typedText, sortPrefix);

        return {
          label: route.name,
          kind: CompletionItemKind.Value,
          detail: detail,
          documentation: this.buildRouteDocumentation(route),
          sortText: matchScore,
          textEdit: TextEdit.replace(replaceRange, route.name),
          filterText: route.name
        };
      });
  }

  protected buildRouteDocumentation(route: { name: string; path?: string; sourceFile?: string; sourceType?: string }): string {
    let doc = `**Route:** ${route.name}\n\n`;
    if (route.path) doc += `**Path:** ${route.path}\n\n`;
    if (route.sourceType) doc += `**Source:** ${route.sourceType}\n\n`;
    if (route.sourceFile) doc += `**File:** ${route.sourceFile}`;
    return doc;
  }
}
