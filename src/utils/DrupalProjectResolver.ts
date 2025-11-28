import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves Drupal project structure
 * Handles different Drupal root locations: root, web/, docroot/
 */
export class DrupalProjectResolver {
  private readonly workspaceRoot: string;
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
   * Check if Drupal root was detected
   */
  isDrupalDetected(): boolean {
    return this.drupalRoot !== null;
  }
}
