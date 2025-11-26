import { CompletionItem, CompletionItemKind, Position, TextEdit, Range } from 'vscode-languageserver';
import { BaseCompletionProvider } from '../base/BaseCompletionProvider';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { getYamlServiceParser } from '../../server';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * YAML Completion Provider
 * Provides autocomplete for service names, classes, and arguments
 */
export class YamlCompletionProvider extends BaseCompletionProvider {
  constructor() {
    super(new YamlServiceNameExtractor());
  }

  canProvide(document: TextDocument, _position: Position): boolean {
    const uri = document.uri;
    return uri.endsWith('.yml') || uri.endsWith('.yaml');
  }

  async provideCompletions(document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    if (!this.isInServicesSection(text, offset)) {
      return [];
    }

    const charBeforeCursor = position.character > 0 ? line[position.character - 1] : '';
    const completionType = this.detectCompletionType(line, charBeforeCursor);

    switch (completionType) {
      case 'service-name':
      case 'parent':
        return super.provideCompletions(document, position);
      case 'class-name':
        return this.getClassNameCompletions();
      case 'argument-service':
        return this.getArgumentServiceCompletions(document, position);
      default:
        return [];
    }
  }

  protected isServiceCompletionContext(line: string, position: Position): boolean {
    return this.detectCompletionType(line, '') === 'service-name' ||
      this.detectCompletionType(line, '') === 'parent';
  }

  protected getTypedText(line: string, position: Position): string {
    // Extract typed service name
    const match = line.match(/:\s*['"]?([a-zA-Z0-9_.]*)$/);
    return match ? match[1] : '';
  }

  private isInServicesSection(text: string, offset: number): boolean {
    return text.substring(0, offset).includes('services:');
  }

  private detectCompletionType(line: string, charBeforeCursor: string): string {
    if (line.trim().startsWith('class:')) return 'class-name';
    if (line.trim().startsWith('parent:')) return 'parent';

    // Check if we're in arguments context
    // Matches: "arguments: [", "arguments: ['@service',", "- '@service'", "- @service"
    const inArgumentsArray = /arguments:\s*\[/.test(line);
    const inArgumentsList = line.trim().startsWith('-') && line.includes('@');
    const hasCommaBeforeCursor = line.includes(',');
    
    if (inArgumentsArray || inArgumentsList || hasCommaBeforeCursor) {
      return 'argument-service';
    }

    // Also check if previous non-empty line has "arguments:"
    if (line.trim().startsWith('-') || line.includes('@')) {
      return 'argument-service';
    }

    if (/^\s{2}\w+:\s*$/.test(line)) return 'service-name';
    return 'unknown';
  }

  private getClassNameCompletions(): CompletionItem[] {
    const parser = getYamlServiceParser();
    if (!parser) return [];

    const allServices = parser.getAllServices();
    const uniqueClasses = new Set<string>();
    const items: CompletionItem[] = [];

    for (const service of allServices) {
      if (service.class && !uniqueClasses.has(service.class)) {
        uniqueClasses.add(service.class);

        const parts = service.class.split('\\');
        const namespace = parts.slice(0, -1).join('\\');

        items.push({
          label: service.class,
          kind: CompletionItemKind.Class,
          detail: namespace,
          insertText: service.class,
          documentation: `Class: ${service.class}\nNamespace: ${namespace}`
        });
      }
    }

    return items;
  }

  private getArgumentServiceCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const parser = getYamlServiceParser();
    const allServices = parser.getAllServices();
    const validServices = this.filterValidServices(allServices);

    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    // Find word start - look backwards from cursor
    let wordStart = position.character - 1;
    while (wordStart >= 0) {
      const char = line[wordStart];
      // Stop at delimiters
      if (char === ' ' || char === ',' || char === "'" || char === '"' ||
        char === '[' || char === '(' || char === ':' || char === '\t') {
        wordStart++;
        break;
      }
      wordStart--;
    }
    if (wordStart < 0) wordStart = 0;

    // Extract the current word being typed
    const currentWord = line.substring(wordStart, position.character).trim();
    const startsWithAt = currentWord.startsWith('@');
    
    // Typed text for filtering (without @)
    const typedText = startsWithAt ? currentWord.substring(1) : currentWord;

    // Build completion items
    return validServices.map(service => {
      const detail = this.buildServiceDetail(service);
      const sortPrefix = this.getSortPrefix(service.sourceType);
      const matchScore = this.calculateMatchScore(service.name, typedText, sortPrefix);

      // If user already typed @, replace from @ position
      if (startsWithAt) {
        return {
          label: service.name,
          kind: CompletionItemKind.Field,
          detail: detail,
          documentation: this.buildServiceDocumentation(service),
          sortText: matchScore,
          textEdit: TextEdit.replace(
            Range.create(position.line, wordStart, position.line, position.character),
            `@${service.name}`
          ),
          filterText: service.name
        };
      }

      // Otherwise insert @service_name
      return {
        label: `@${service.name}`,
        kind: CompletionItemKind.Field,
        detail: detail,
        documentation: this.buildServiceDocumentation(service),
        sortText: matchScore,
        insertText: `@${service.name}`,
        filterText: service.name
      };
    });
  }
}
