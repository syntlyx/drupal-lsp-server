import { BaseClassResolver, ClassInfo } from './BaseClassResolver';
import { DrupalService } from '../../parsers/YamlServiceParser';

/**
 * Builds hover content for services and classes
 * Unified formatting for YAML and PHP providers
 */
export class HoverContentBuilder {
  constructor(private classResolver: BaseClassResolver) { }

  /**
   * Build hover content for a service
   */
  async buildServiceHover(service: DrupalService): Promise<string> {
    let content = '';

    if (service.sourceFile) {
      const line = service.sourceLine ? parseInt(service.sourceLine, 10) : 1;
      content += `**Service:** [\`${service.name}\`](file://${service.sourceFile}#${line})\n\n`;
    } else {
      content += `**Service:** \`${service.name}\`\n\n`;
    }

    // Class with clickable link
    if (service.class) {
      const classPath = this.classResolver.resolveClassPath(service.class);
      if (classPath) {
        const classLine = await this.classResolver.getSymbolLocation(classPath);
        content += `**Class:** [\`${service.class}\`](file://${classPath}#${classLine + 1})\n\n`;
      } else {
        content += `**Class:** \`${service.class}\`\n\n`;
      }
    }

    // Parent service
    if (service.parent) {
      content += `**Parent:** \`${service.parent}\`\n\n`;
    }

    // Arguments
    if (service.arguments && service.arguments.length > 0) {
      content += `**Arguments:** ${service.arguments.join(', ')}\n\n`;
    }

    return content;
  }

  /**
   * Build hover content for a class (with optional method)
   */
  async buildClassHover(classInfo: ClassInfo): Promise<string> {
    let content = '';
    const classPath = this.classResolver.resolveClassPath(classInfo.className);

    // Class with clickable link
    if (classPath) {
      const classLine = await this.classResolver.getSymbolLocation(classPath);
      content += `**Class:** [\`${classInfo.className}\`](file://${classPath}#${classLine + 1})\n\n`;

      // Extract class documentation
      const classDoc = await this.extractDocumentation(classPath, classLine, false);
      if (classDoc) {
        content += `${classDoc}\n\n`;
      }
    } else {
      content += `**Class:** \`${classInfo.className}\`\n\n`;
    }

    // Method with clickable link (if provided)
    if (classInfo.methodName) {
      if (classPath) {
        const methodLine = await this.classResolver.getSymbolLocation(classPath, classInfo.methodName);
        content += `**Method:** [\`${classInfo.methodName}\`](file://${classPath}#${methodLine + 1})\n\n`;

        // Extract method documentation
        const methodDoc = await this.extractDocumentation(classPath, methodLine, true);
        if (methodDoc) {
          content += `${methodDoc}\n\n`;
        }
      } else {
        content += `**Method:** \`${classInfo.methodName}\`\n\n`;
      }
    }

    return content;
  }

  /**
   * Extract PHPDoc comment for symbol at given line
   */
  private async extractDocumentation(filePath: string, line: number | null, isMethod: boolean = false): Promise<string | null> {
    if (line === null) return null;

    try {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Look backwards from symbol line to find PHPDoc
      const docLines: string[] = [];
      let foundDocEnd = false;

      for (let i = line - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();

        if (trimmed === '*/') {
          foundDocEnd = true;
          continue;
        }

        if (foundDocEnd) {
          if (trimmed.startsWith('/**')) {
            docLines.reverse();
            return this.formatPhpDoc(docLines, isMethod);
          }

          // Remove leading * and whitespace
          const docLine = trimmed.replace(/^\*\s?/, '');
          docLines.push(docLine);
        }

        // Stop if we hit another declaration or too far away
        if (!foundDocEnd && trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('#[')) {
          break;
        }
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  /**
   * Format PHPDoc lines into readable markdown
   */
  private formatPhpDoc(lines: string[], isMethod: boolean): string {
    const description: string[] = [];
    const params: Array<{ type: string, name: string, desc: string }> = [];
    let returnInfo: { type: string, desc: string } | null = null;
    const links: string[] = [];

    let currentParam: { type: string, name: string, desc: string } | null = null;
    let currentReturn: { type: string, desc: string } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Empty line - finish current param/return
        if (currentParam) {
          params.push(currentParam);
          currentParam = null;
        }
        if (currentReturn) {
          returnInfo = currentReturn;
          currentReturn = null;
        }
        continue;
      }

      if (isMethod && trimmed.startsWith('@param')) {
        // Save previous param if any
        if (currentParam) {
          params.push(currentParam);
        }

        // Parse: @param \Type $name Description
        const match = trimmed.match(/@param\s+(\S+)\s+(\$\S+)(?:\s+(.*))?/);
        if (match) {
          currentParam = {
            type: match[1],
            name: match[2],
            desc: match[3] || ''
          };
        }
      } else if (isMethod && trimmed.startsWith('@return')) {
        // Save previous return if any
        if (currentReturn) {
          returnInfo = currentReturn;
        }

        // Parse: @return Type Description
        const match = trimmed.match(/@return\s+(\S+)(?:\s+(.*))?/);
        if (match) {
          currentReturn = {
            type: match[1],
            desc: match[2] || ''
          };
        }
      } else if (trimmed.startsWith('@see') || trimmed.startsWith('@link')) {
        links.push(trimmed);
      } else if (!trimmed.startsWith('@')) {
        // Continuation of description, param, or return
        if (currentParam) {
          currentParam.desc += ' ' + trimmed;
        } else if (currentReturn) {
          currentReturn.desc += ' ' + trimmed;
        } else {
          description.push(trimmed);
        }
      }
    }

    // Remember last param/return
    if (currentParam) {
      params.push(currentParam);
    }
    if (currentReturn) {
      returnInfo = currentReturn;
    }

    let formatted = '';

    // Description
    if (description.length > 0) {
      formatted += description.join(' ') + '\n\n';
    }

    // Parameters (for methods)
    if (params.length > 0) {
      formatted += '**Parameters:**\n\n';
      params.forEach((param) => {
        formatted += `- \`${param.type}\` **${param.name}**`;
        if (param.desc) {
          formatted += ` - ${param.desc}`;
        }
        formatted += '\n';
      });
      formatted += '\n';
    }

    // Return type (for methods)
    if (returnInfo) {
      formatted += `**Returns:** \`${returnInfo.type}\``;
      if (returnInfo.desc) {
        formatted += ` - ${returnInfo.desc}`;
      }
      formatted += '\n\n';
    }

    // Links
    if (links.length > 0) {
      formatted += links.join('\n') + '\n';
    }

    return formatted.trim() || '';
  }

  /**
   * Build hover content for undefined service
   */
  buildUndefinedServiceHover(serviceName: string): string {
    return `Service \`${serviceName}\` not found`;
  }
}
