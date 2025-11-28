import * as fs from 'fs';
import * as path from 'path';

export type ClassInfo = { className: string; methodName?: string };

/**
 * Resolves PHP class names to file paths
 * Handles Drupal's namespace conventions
 */
export class BaseClassResolver {
  constructor(private drupalRoot: string) { }

  /**
   * Resolve class path from namespace
   * Drupal\Core\Logger\LoggerChannelFactory → core/lib/Drupal/Core/Logger/LoggerChannelFactory.php
   * Drupal\module_name\Service → modules/.../src/Service.php
   */
  resolveClassPath(className: string): string | null {
    const parts = className.split('\\');

    // Core namespace: Drupal\Core\...
    if (parts[0] === 'Drupal' && parts[1] === 'Core') {
      const relativePath = parts.slice(2).join('/');
      return path.join(this.drupalRoot, 'core', 'lib', 'Drupal', 'Core', `${relativePath}.php`);
    }

    // Module namespace: Drupal\module_name\...
    if (parts[0] === 'Drupal' && parts.length >= 3) {
      const moduleName = parts[1];
      const relativePath = parts.slice(2).join('/');

      // Try custom, contrib, core modules
      const locations = [
        path.join(this.drupalRoot, 'modules', 'custom', moduleName, 'src', `${relativePath}.php`),
        path.join(this.drupalRoot, 'modules', 'contrib', moduleName, 'src', `${relativePath}.php`),
        path.join(this.drupalRoot, 'modules', moduleName, 'src', `${relativePath}.php`)
      ];

      for (const loc of locations) {
        if (fs.existsSync(loc)) return loc;
      }
    }

    return null;
  }

  /**
   * Extract class name and optional method from YAML line
   * Works for both services.yml and routing.yml files
   */
  extractClassFromYamlLine(line: string, character: number): ClassInfo | null {
    const match = line.match(/:\s*['"]?\\?([A-Za-z0-9_\\]+)(?:::([A-Za-z0-9_]+))?['"]?/);

    if (!match) {
      return null;
    }

    const fullMatch = match[0];
    const className = match[1];
    const methodName = match[2];

    // Check if the cursor is within the matched string
    const matchStart = line.indexOf(fullMatch);
    const matchEnd = matchStart + fullMatch.length;

    if (character < matchStart || character > matchEnd) {
      return null;
    }

    return {
      className: className.startsWith('Drupal\\') ? className : `Drupal\\${className}`,
      methodName
    };
  }

  /**
   * Alias for extractClassFromYamlLine (for clarity in routing.yml context)
   */
  extractClassFromRoutingLine(line: string, character: number): ClassInfo | null {
    return this.extractClassFromYamlLine(line, character);
  }

  /**
   * Get a symbol location (class or method) in a PHP file
   */
  async getSymbolLocation(filePath: string, methodName?: string): Promise<number> {
    try {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      if (methodName) {
        // Search for method definition
        // Match: public function methodName(
        // Match: public static function methodName(
        const methodRegex = new RegExp(`\\s+(public|protected|private)\\s+(static\\s+)?function\\s+${methodName}\\s*\\(`);

        for (let i = 0; i < lines.length; i++) {
          if (methodRegex.test(lines[i])) {
            return i;
          }
        }
      }

      // Fallback to class definition or if no method specified
      // Match: class ClassName
      // Match: abstract class ClassName
      // Match: final class ClassName
      const classRegex = /\s*(abstract\s+|final\s+)?class\s+\w+/;

      for (let i = 0; i < lines.length; i++) {
        if (classRegex.test(lines[i])) {
          return i;
        }
      }
    } catch {
      // Ignore errors
    }

    return 1;
  }
}
