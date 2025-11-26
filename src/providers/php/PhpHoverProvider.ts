import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Hover, MarkupKind } from 'vscode-languageserver';
import { IHoverProvider } from '../IHoverProvider';
import { BaseServiceProvider } from '../base/BaseServiceProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { getYamlServiceParser } from '../../server';

/**
 * PHP Hover Provider
 * Shows service information on hover in PHP files
 */
export class PhpHoverProvider extends BaseServiceProvider implements IHoverProvider {
  private extractor: PhpServiceNameExtractor;
  private classResolver: BaseClassResolver | null = null;

  constructor() {
    super();
    this.extractor = new PhpServiceNameExtractor();
  }

  canProvide(document: TextDocument, position: Position): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (!serviceName) return null;

    const parser = getYamlServiceParser();
    const service = parser.getService(serviceName);
    if (!service) return null;

    // Initialize class resolver if needed
    if (!this.classResolver) {
      this.classResolver = new BaseClassResolver(parser.getDrupalRoot());
    }

    // Build hover content
    const label = this.getServiceTypeLabel(service.sourceType);
    let content = `${label}**Service:** \`${service.name}\`\n\n`;

    // Class with clickable link
    if (service.class) {
      const classPath = this.classResolver.resolveClassPath(service.class);
      if (classPath) {
        content += `**Class:** [\`${service.class}\`](file://${classPath})\n\n`;
      } else {
        content += `**Class:** \`${service.class}\`\n\n`;
      }
    }

    // Parent service
    if (service.parent) {
      content += `**Parent:** \`${service.parent}\`\n\n`;
    }

    // Arguments count
    if (service.arguments && service.arguments.length > 0) {
      content += `**Arguments:** ${service.arguments.length}\n\n`;
    }

    // Tags count
    if (service.tags && service.tags.length > 0) {
      content += `**Tags:** ${service.tags.length}\n\n`;
    }

    // Source file with clickable link (with line number)
    if (service.sourceFile) {
      const line = service.sourceLine ? parseInt(service.sourceLine, 10) : 1;
      content += `📁 [Defined in YAML](file://${service.sourceFile}#${line})`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }
}
