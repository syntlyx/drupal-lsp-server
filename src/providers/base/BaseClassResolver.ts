import * as fs from 'fs';
import * as path from 'path';

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
}
