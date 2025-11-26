import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves Drupal project structure
 * Handles different Drupal root locations: root, web/, docroot/
 */
export class DrupalProjectResolver {
  private workspaceRoot: string;
  private drupalRoot: string | null = null;
  
  // Common Drupal root directories
  private static DRUPAL_ROOT_CANDIDATES = ['', 'web', 'docroot'];
  
  // Files that indicate Drupal root
  private static DRUPAL_INDICATORS = [
    'core/lib/Drupal.php',
    'autoload.php',
    'index.php'
  ];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.detectDrupalRoot();
  }

  /**
   * Detect Drupal root directory
   */
  private detectDrupalRoot(): void {
    for (const candidate of DrupalProjectResolver.DRUPAL_ROOT_CANDIDATES) {
      const testPath = path.join(this.workspaceRoot, candidate);
      
      if (this.isDrupalRoot(testPath)) {
        this.drupalRoot = candidate;
        return;
      }
    }
  }

  /**
   * Check if directory is Drupal root
   */
  private isDrupalRoot(testPath: string): boolean {
    for (const indicator of DrupalProjectResolver.DRUPAL_INDICATORS) {
      const indicatorPath = path.join(testPath, indicator);
      if (fs.existsSync(indicatorPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get Drupal root path (relative to workspace)
   */
  getDrupalRoot(): string {
    return this.drupalRoot || '';
  }

  /**
   * Get absolute Drupal root path
   */
  getDrupalRootAbsolute(): string {
    return path.join(this.workspaceRoot, this.drupalRoot || '');
  }

  /**
   * Resolve path relative to Drupal root
   * @param relativePath Path relative to Drupal root (e.g., 'core/lib/Drupal.php')
   */
  resolveDrupalPath(relativePath: string): string {
    return path.join(this.getDrupalRootAbsolute(), relativePath);
  }

  /**
   * Check if file exists in Drupal root
   */
  drupalFileExists(relativePath: string): boolean {
    return fs.existsSync(this.resolveDrupalPath(relativePath));
  }

  /**
   * Resolve class file path
   * Handles: Drupal\Core, Drupal\Component, Drupal\module_name
   */
  resolveClassFile(fqn: string): string | null {
    // Core: Drupal\Core\Logger\LoggerChannelFactory
    if (fqn.startsWith('Drupal\\Core\\')) {
      const relativePath = fqn.replace(/\\/g, '/');
      const filePath = this.resolveDrupalPath(`core/lib/${relativePath}.php`);
      if (fs.existsSync(filePath)) return filePath;
    }

    // Component: Drupal\Component\Utility\...
    if (fqn.startsWith('Drupal\\Component\\')) {
      const relativePath = fqn.replace(/\\/g, '/');
      const filePath = this.resolveDrupalPath(`core/lib/${relativePath}.php`);
      if (fs.existsSync(filePath)) return filePath;
    }

    // Module: Drupal\module_name\...
    const moduleMatch = fqn.match(/^Drupal\\([^\\]+)\\/);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      const classPath = fqn.replace(/^Drupal\\[^\\]+\\/, '').replace(/\\/g, '/');
      
      // Try: modules/{module}/src/
      const moduleBase = this.resolveDrupalPath(`modules/${moduleName}/src/${classPath}.php`);
      if (fs.existsSync(moduleBase)) return moduleBase;
      
      // Try: modules/custom/{module}/src/
      const customPath = this.resolveDrupalPath(`modules/custom/${moduleName}/src/${classPath}.php`);
      if (fs.existsSync(customPath)) return customPath;
      
      // Try: modules/contrib/{module}/src/
      const contribPath = this.resolveDrupalPath(`modules/contrib/${moduleName}/src/${classPath}.php`);
      if (fs.existsSync(contribPath)) return contribPath;
    }

    return null;
  }

  /**
   * Find .phpstorm.meta.php location
   */
  findPhpStormMetaPath(): string | null {
    const metaPath = this.resolveDrupalPath('.phpstorm.meta.php');
    if (fs.existsSync(metaPath)) {
      return metaPath;
    }
    return null;
  }

  /**
   * Check if Drupal root was detected
   */
  isDrupalDetected(): boolean {
    return this.drupalRoot !== null;
  }
}
