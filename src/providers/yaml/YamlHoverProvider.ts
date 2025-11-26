import { Hover, Position, MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IHoverProvider } from '../IHoverProvider';
import { BaseServiceProvider } from '../base/BaseServiceProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { getYamlServiceParser, getDrupalResolver } from '../../server';

/**
 * YAML Hover Provider
 * Shows service and class information on hover in YAML files
 */
export class YamlHoverProvider extends BaseServiceProvider implements IHoverProvider {
  private extractor: YamlServiceNameExtractor;
  private classResolver: BaseClassResolver | null = null;

  constructor() {
    super();
    this.extractor = new YamlServiceNameExtractor();
  }

  canProvide(document: TextDocument, position: Position): boolean {
    const uri = document.uri;
    return uri.endsWith('.yml') || uri.endsWith('.yaml');
  }

  async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    // 1. Check if hovering over class name
    const classMatch = line.match(/^\s*class:\s*['"]?([A-Za-z0-9_\\]+)['"]?\s*$/);
    if (classMatch) {
      return this.provideClassHover(classMatch[1]);
    }

    // 2. Check if hovering over parent or @service
    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (serviceName) {
      return this.provideServiceHover(serviceName);
    }

    return null;
  }

  private async provideClassHover(className: string): Promise<Hover | null> {
    const drupalResolver = getDrupalResolver();
    if (!drupalResolver) return null;

    const filePath = drupalResolver.resolveClassFile(className);
    let content = `**Class:** \`${className}\`\n\n`;

    if (filePath) {
      content += `📁 [Click to open file](file://${filePath})`;
    } else {
      content += `⚠️ File not found`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }

  private async provideServiceHover(serviceName: string): Promise<Hover | null> {
    const parser = getYamlServiceParser();
    const service = parser.getService(serviceName);

    if (!service) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `⚠️ Service \`${serviceName}\` not found`
        }
      };
    }

    if (!this.classResolver) {
      this.classResolver = new BaseClassResolver(parser.getDrupalRoot());
    }

    const label = this.getServiceTypeLabel(service.sourceType);
    let content = `${label} **Service:** \`${service.name}\`\n\n`;

    if (service.class) {
      const classPath = this.classResolver.resolveClassPath(service.class);
      if (classPath) {
        content += `**Class:** [\`${service.class}\`](file://${classPath})\n\n`;
      } else {
        content += `**Class:** \`${service.class}\`\n\n`;
      }
    }

    if (service.parent) {
      content += `**Parent:** \`${service.parent}\`\n\n`;
    }

    if (service.arguments && service.arguments.length > 0) {
      content += `**Arguments:** ${service.arguments.length}\n\n`;
    }

    if (service.tags && service.tags.length > 0) {
      content += `**Tags:** ${service.tags.length}\n\n`;
    }

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
