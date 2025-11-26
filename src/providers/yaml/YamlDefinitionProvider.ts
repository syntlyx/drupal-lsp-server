import { Definition, Location, Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IDefinitionProvider } from '../IDefinitionProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { getYamlServiceParser, getDrupalResolver } from '../../server';

/**
 * YAML Definition Provider
 * Handles go-to-definition for:
 * - PHP class names (class: Drupal\...)
 * - Service references (parent: service_name, @service_name)
 */
export class YamlDefinitionProvider implements IDefinitionProvider {
  private extractor: YamlServiceNameExtractor;
  private classResolver: BaseClassResolver | null = null;

  constructor() {
    this.extractor = new YamlServiceNameExtractor();
  }

  canProvide(document: TextDocument, position: Position): boolean {
    const uri = document.uri;
    return uri.endsWith('.yml') || uri.endsWith('.yaml');
  }

  async provideDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    // 1. Check if we're on a class: line
    const classMatch = line.match(/^\s*class:\s*['"]?([A-Za-z0-9_\\]+)['"]?\s*$/);
    if (classMatch) {
      return this.resolveClassDefinition(classMatch[1]);
    }

    // 2. Check if we're on parent or @service
    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (serviceName) {
      return this.resolveServiceDefinition(serviceName);
    }

    return null;
  }

  /**
   * Resolve class definition location
   */
  private async resolveClassDefinition(className: string): Promise<Definition | null> {
    const parser = getYamlServiceParser();

    if (!this.classResolver) {
      this.classResolver = new BaseClassResolver(parser.getDrupalRoot());
    }

    const filePath = this.classResolver.resolveClassPath(className);
    if (!filePath) {
      return null;
    }

    return Location.create(`file://${filePath}`, Range.create(0, 0, 0, 0));
  }

  /**
   * Resolve service definition location
   */
  private async resolveServiceDefinition(serviceName: string): Promise<Definition | null> {
    const parser = getYamlServiceParser();
    const service = parser.getService(serviceName);

    if (!service || !service.sourceFile) {
      return null;
    }

    // Use stored line number if available
    const line = service.sourceLine ? parseInt(service.sourceLine, 10) - 1 : 0;

    return Location.create(
      `file://${service.sourceFile}`,
      Range.create(line, 0, line, 0)
    );
  }
}
