import { Hover, Position, MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IHoverProvider } from '../IHoverProvider';
import { BaseServiceProvider } from '../base/BaseServiceProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { HoverContentBuilder } from '../base/HoverContentBuilder';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { getYamlServiceParser } from '../../server';
import { YamlServiceParser } from '../../parsers/YamlServiceParser';

/**
 * YAML Hover Provider
 * Shows service and class information on hover in YAML files
 * Supports: .services.yml, .routing.yml
 */
export class YamlHoverProvider extends BaseServiceProvider implements IHoverProvider {
  private yamlParser: YamlServiceParser;
  private extractor: YamlServiceNameExtractor;
  private readonly classResolver: BaseClassResolver;
  private contentBuilder: HoverContentBuilder;

  constructor() {
    super();
    this.extractor = new YamlServiceNameExtractor();
    this.yamlParser = getYamlServiceParser();
    this.classResolver = new BaseClassResolver(this.yamlParser.getDrupalRoot());
    this.contentBuilder = new HoverContentBuilder(this.classResolver);
  }

  canProvide(document: TextDocument): boolean {
    const uri = document.uri;
    return uri.endsWith('.yml') || uri.endsWith('.yaml');
  }

  async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    // For routing.yml: check for class hover
    const classInfo = this.classResolver.extractClassFromRoutingLine(line, position.character);
    if (classInfo) {
      const content = await this.contentBuilder.buildClassHover(classInfo);
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: content
        }
      };
    }

    // Check if hovering over service reference (parent or @service)
    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (serviceName) {
      const service = this.yamlParser.getService(serviceName);

      if (!service) {
        const content = this.contentBuilder.buildUndefinedServiceHover(serviceName);
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: content
          }
        };
      }

      const content = await this.contentBuilder.buildServiceHover(service);

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: content
        }
      };
    }

    return null;
  }
}
