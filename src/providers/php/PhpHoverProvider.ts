import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Hover, MarkupKind } from 'vscode-languageserver';
import { IHoverProvider } from '../IHoverProvider';
import { BaseServiceProvider } from '../base/BaseServiceProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { HoverContentBuilder } from '../base/HoverContentBuilder';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { getYamlServiceParser } from '../../server';
import { YamlServiceParser } from '../../parsers/YamlServiceParser';

/**
 * PHP Hover Provider
 * Shows service information on hover in PHP files
 */
export class PhpHoverProvider extends BaseServiceProvider implements IHoverProvider {
  private yamlParser: YamlServiceParser;
  private extractor: PhpServiceNameExtractor;
  private readonly classResolver: BaseClassResolver;
  private contentBuilder: HoverContentBuilder;

  constructor() {
    super();
    this.extractor = new PhpServiceNameExtractor();
    this.yamlParser = getYamlServiceParser();
    this.classResolver = new BaseClassResolver(this.yamlParser.getDrupalRoot());
    this.contentBuilder = new HoverContentBuilder(this.classResolver);
  }

  canProvide(document: TextDocument): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (!serviceName) {
      return null;
    }

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

    // Build hover content using unified builder
    const content = await this.contentBuilder.buildServiceHover(service);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }
}
