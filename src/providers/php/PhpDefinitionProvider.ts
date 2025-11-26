import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location, Range } from 'vscode-languageserver';
import { IDefinitionProvider } from '../IDefinitionProvider';
import { BaseClassResolver } from '../base/BaseClassResolver';
import { PhpServiceNameExtractor } from './PhpServiceNameExtractor';
import { getYamlServiceParser } from '../../server';
import * as fs from 'fs';

/**
 * PHP Definition Provider
 * Handles go-to-definition for DI container calls
 */
export class PhpDefinitionProvider implements IDefinitionProvider {
  private extractor: PhpServiceNameExtractor;
  private classResolver: BaseClassResolver | null = null;

  constructor() {
    this.extractor = new PhpServiceNameExtractor();
  }

  canProvide(document: TextDocument, position: Position): boolean {
    return document.languageId === 'php' || document.uri.endsWith('.php');
  }

  async provideDefinition(document: TextDocument, position: Position): Promise<Location | null> {
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

    // Priority: class definition > YAML definition
    if (service.class) {
      const classPath = this.classResolver.resolveClassPath(service.class);

      if (classPath && fs.existsSync(classPath)) {
        return Location.create(`file://${classPath}`, Range.create(0, 0, 0, 0));
      }
    }

    // Fallback: YAML definition with line number
    if (service.sourceFile) {
      const line = service.sourceLine ? parseInt(service.sourceLine, 10) - 1 : 0;
      return Location.create(
        `file://${service.sourceFile}`,
        Range.create(line, 0, line, 0)
      );
    }

    return null;
  }
}
