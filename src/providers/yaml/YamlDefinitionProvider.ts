import { Definition, Location, Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IDefinitionProvider } from '../IDefinitionProvider';
import { BaseClassResolver, ClassInfo } from '../base/BaseClassResolver';
import { YamlServiceNameExtractor } from './YamlServiceNameExtractor';
import { getYamlServiceParser } from '../../server';
import { YamlServiceParser } from '../../parsers/YamlServiceParser';

/**
 * YAML Definition Provider
 * Handles go-to-definition for:
 * - PHP class names (class: Drupal\...)
 * - Service references (parent: service_name, @service_name)
 */
export class YamlDefinitionProvider implements IDefinitionProvider {
  private yamlParser: YamlServiceParser;
  private extractor: YamlServiceNameExtractor;
  private classResolver: BaseClassResolver;

  constructor() {
    this.extractor = new YamlServiceNameExtractor();
    this.yamlParser = getYamlServiceParser();
    this.classResolver = new BaseClassResolver(this.yamlParser.getDrupalRoot());
  }

  canProvide(document: TextDocument): boolean {
    const uri = document.uri;
    return uri.endsWith('.yml') || uri.endsWith('.yaml');
  }

  async provideDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: 1000 }
    });

    // Check if we're on a class: line
    const classInfo = this.classResolver.extractClassFromRoutingLine(line, position.character);
    if (classInfo) {
      return this.resolveClassDefinition(classInfo);
    }

    // Check if we're on parent or @service
    const serviceName = this.extractor.extractServiceName(line, position.character);
    if (serviceName) {
      return this.resolveServiceDefinition(serviceName);
    }

    return null;
  }

  /**
   * Resolve class definition location
   */
  private async resolveClassDefinition(classInfo: ClassInfo): Promise<Definition | null> {
    const classPath = this.classResolver.resolveClassPath(classInfo.className);
    if (!classPath) {
      return null;
    }

    const location = await this.classResolver.getSymbolLocation(classPath, classInfo.methodName);
    return Location.create(`file://${classPath}`, Range.create(location, 0, location, 0));
  }

  /**
   * Resolve service definition location
   */
  private async resolveServiceDefinition(serviceName: string): Promise<Definition | null> {
    const service = this.yamlParser.getService(serviceName);

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
