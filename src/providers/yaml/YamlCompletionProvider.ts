import { CompletionItem, CompletionItemKind, Position, TextEdit, Range } from 'vscode-languageserver';
import { BaseCompletionProvider } from '../base/BaseCompletionProvider';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { YamlRouteNameExtractor } from './YamlRouteNameExtractor';
import { getYamlServiceParser, getYamlRouteParser, getYamlLinkParser } from '../../server';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * YAML Completion Provider
 * Provides autocomplete for service names, classes, arguments, and routes
 */
export class YamlCompletionProvider extends BaseCompletionProvider {
  private routeExtractor: YamlRouteNameExtractor;

  constructor() {
    super(new YamlServiceNameExtractor());
    this.routeExtractor = new YamlRouteNameExtractor();
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

    const uri = document.uri;
    const isLinksFile = uri.includes('.links.');
    const isServicesFile = uri.endsWith('.services.yml');

    // Parent link completion in links.*.yml files
    if (isLinksFile && this.isParentLinkContext(line)) {
      return this.getParentLinkCompletions(document, position);
    }

    // Route completion in links.*.yml files
    if (isLinksFile && this.routeExtractor.isRouteContext(line)) {
      return this.getRouteCompletions(document, position);
    }

    // Service completion in .services.yml files
    if (isServicesFile && this.isInServicesSection(text, offset)) {
      const completionType = this.detectCompletionType(line);

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

    return [];
  }

  protected isServiceCompletionContext(line: string): boolean {
    return this.detectCompletionType(line) === 'service-name' ||
      this.detectCompletionType(line) === 'parent';
  }

  protected getTypedText(line: string): string {
    // Extract typed service name
    const match = line.match(/:\s*['"]?([a-zA-Z0-9_.]*)$/);
    return match ? match[1] : '';
  }

  private isInServicesSection(text: string, offset: number): boolean {
    return text.substring(0, offset).includes('services:');
  }

  private detectCompletionType(line: string): string {
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
    return validServices.map((service) => {
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

  private getRouteCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const routeParser = getYamlRouteParser();
    if (!routeParser) return [];

    const allRoutes = routeParser.getAllRoutes();
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    const typedText = this.routeExtractor.getTypedRoute(line);

    // Find the start position of the route name
    // Match "route:", "route_name:", or "base_route:" followed by optional space and optional quote
    const routeKeyMatch = line.match(/\s*(?:route_name|route|base_route):\s*/);
    if (!routeKeyMatch) return [];

    let routeStart = routeKeyMatch[0].length;

    // Check if there's a quote after the colon
    if (routeStart < line.length && (line[routeStart] === "'" || line[routeStart] === '"')) {
      routeStart++; // Move past the opening quote
    }

    // Create replace range from start of route name to cursor position
    const replaceRange = Range.create(
      position.line,
      routeStart,
      position.line,
      position.character
    );

    return this.allRoutesCompletions(allRoutes, replaceRange, typedText);
  }

  /**
   * Check if line is in parent link context
   */
  private isParentLinkContext(line: string): boolean {
    return /\s*parent:\s*['"]?[a-z0-9._]*$/.test(line);
  }

  /**
   * Get parent link completions
   */
  private getParentLinkCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const linkParser = getYamlLinkParser();
    if (!linkParser) return [];

    const allLinks = linkParser.getAllLinks();
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    // Extract typed text after "parent:"
    const match = line.match(/\s*parent:\s*['"]?([a-z0-9._]*)$/);
    const typedText = match ? match[1] : '';

    // Find start position after "parent:"
    const parentKeyMatch = line.match(/\s*parent:\s*/);
    if (!parentKeyMatch) return [];

    let parentStart = parentKeyMatch[0].length;

    // Check if there's a quote
    if (parentStart < line.length && (line[parentStart] === "'" || line[parentStart] === '"')) {
      parentStart++;
    }

    const replaceRange = Range.create(
      position.line,
      parentStart,
      position.line,
      position.character
    );

    return allLinks
      .filter((link) => link.name.toLowerCase().includes(typedText.toLowerCase()))
      .map((link) => {
        const detail = link.sourceType ? `[${link.sourceType}] ${link.title || ''}` : link.title;
        const sortPrefix = link.sourceType === 'custom' ? '0' : link.sourceType === 'contrib' ? '1' : '2';
        const matchScore = this.calculateLinkMatchScore(link.name, typedText, sortPrefix);

        return {
          label: link.name,
          kind: CompletionItemKind.Reference,
          detail: detail,
          documentation: this.buildLinkDocumentation(link),
          sortText: matchScore,
          textEdit: TextEdit.replace(replaceRange, link.name),
          filterText: link.name
        };
      });
  }

  private calculateLinkMatchScore(linkName: string, typed: string, sortPrefix: string): string {
    if (!typed) return `${sortPrefix}_${linkName}`;

    const lowerLink = linkName.toLowerCase();
    const lowerTyped = typed.toLowerCase();

    if (lowerLink === lowerTyped) return `${sortPrefix}_0_${linkName}`;
    if (lowerLink.startsWith(lowerTyped)) {
      const remaining = linkName.length - typed.length;
      return `${sortPrefix}_1_${remaining.toString().padStart(5, '0')}_${linkName}`;
    }

    return `${sortPrefix}_2_${linkName}`;
  }

  private buildLinkDocumentation(link: { name: string; title?: string; route_name?: string; sourceFile?: string; sourceType?: string }): string {
    let doc = `**Link:** ${link.name}\n\n`;
    if (link.title) doc += `**Title:** ${link.title}\n\n`;
    if (link.route_name) doc += `**Route:** ${link.route_name}\n\n`;
    if (link.sourceType) doc += `**Source:** ${link.sourceType}\n\n`;
    if (link.sourceFile) doc += `**File:** ${link.sourceFile}`;
    return doc;
  }
}
