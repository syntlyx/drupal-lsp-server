import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Resolves phpcs and phpcbf binary locations
 */
export class PhpCsBinaryResolver {
  private readonly workspaceRoot: string;
  private phpcsPath: string | null = null;
  private phpcbfPath: string | null = null;
  private configPath: string | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.resolve();
  }

  /**
   * Find phpcs/phpcbf binaries and config
   */
  private resolve(): void {
    // Find binaries
    this.phpcsPath = this.findVendorBinary('phpcs') || this.findGlobalBinary('phpcs');
    this.phpcbfPath = this.findVendorBinary('phpcbf') || this.findGlobalBinary('phpcbf');

    // Find config
    this.configPath = this.findConfigFile();
  }

  /**
   * Find binary in vendor/bin
   */
  private findVendorBinary(name: string): string | null {
    const vendorPath = path.join(this.workspaceRoot, 'vendor', 'bin', name);
    if (fs.existsSync(vendorPath)) {
      return vendorPath;
    }
    return null;
  }

  /**
   * Find binary globally using 'which' command
   */
  private findGlobalBinary(name: string): string | null {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {
      // Binary not found globally
    }
    return null;
  }

  /**
   * Find phpcs configuration file
   */
  private findConfigFile(): string | null {
    const candidates = [
      '.phpcs.xml',
      'phpcs.xml',
      'phpcs.xml.dist',
      '.phpcs.xml.dist'
    ];

    for (const candidate of candidates) {
      const configPath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }
    return null;
  }

  /**
   * Check if phpcs is available
   */
  isPhpcsAvailable(): boolean {
    return this.phpcsPath !== null;
  }

  /**
   * Check if phpcbf is available
   */
  isPhpcbfAvailable(): boolean {
    return this.phpcbfPath !== null;
  }

  /**
   * Get phpcs path
   */
  getPhpcsPath(): string | null {
    return this.phpcsPath;
  }

  /**
   * Get phpcbf path
   */
  getPhpcbfPath(): string | null {
    return this.phpcbfPath;
  }

  /**
   * Get standard argument for phpcs/phpcbf
   * Returns config file if found, otherwise 'Drupal'
   */
  getStandard(): string {
    return this.configPath || 'Drupal';
  }
}
