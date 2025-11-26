import * as fs from 'fs';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import { DrupalProjectResolver } from '../utils/DrupalProjectResolver';

export interface DrupalService {
  name: string;
  class?: string;
  parent?: string;
  arguments?: any[];
  tags?: any[];
  calls?: any[];
  factory?: string | string[];
  sourceFile?: string; // Path to .services.yml file
  sourceLine?: string;
  sourceType?: 'core' | 'contrib' | 'custom'; // Service origin
}

/**
 * Parser for Drupal YAML service files
 * Caches parsed services for performance
 * Scans modules/custom for *.services.yml files
 */
export class YamlServiceParser {
  private servicesCache: Map<string, DrupalService[]> = new Map();
  private drupalResolver: DrupalProjectResolver;
  private scannedFiles: Set<string> = new Set();

  constructor(drupalResolver: DrupalProjectResolver) {
    this.drupalResolver = drupalResolver;
  }

  /**
   * Parse services from YAML file
   */
  async parseFile(filePath: string): Promise<DrupalService[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCounter = new YAML.LineCounter();
      const parsed = YAML.parseDocument(content, { lineCounter });

      const servicesNode = parsed.get('services');
      if (!servicesNode || typeof servicesNode !== 'object') {
        return [];
      }

      const services: DrupalService[] = [];
      const sourceType = this.determineSourceType(filePath);

      // Iterate over service definitions
      for (const pair of (servicesNode as any).items || []) {
        const name = pair.key?.value;
        const definition = pair.value;

        if (!name || !definition) continue;

        // Get line number from YAML node
        let lineNumber: number | undefined;
        if (pair.key?.range) {
          const pos = lineCounter.linePos(pair.key.range[0]);
          lineNumber = pos.line;
        }

        // Handle both object definitions and aliases (e.g., '@service_name')
        let defObj: any = {};
        if (typeof definition === 'string') {
          // Simple alias like: service_name: '@another_service'
          defObj = { alias: definition };
        } else if (definition && definition.toJSON) {
          defObj = definition.toJSON();
        } else if (definition) {
          defObj = definition;
        }

        // Ensure defObj is an object
        if (!defObj || typeof defObj !== 'object') {
          defObj = {};
        }

        services.push({
          name,
          class: defObj.class,
          parent: defObj.parent,
          arguments: defObj.arguments,
          tags: defObj.tags,
          calls: defObj.calls,
          factory: defObj.factory,
          sourceFile: filePath,
          sourceType: sourceType,
          sourceLine: lineNumber?.toString(),
        });
      }

      this.servicesCache.set(filePath, services);
      return services;
    } catch (err) {
      // Silently ignore YAML parse errors (e.g., !tagged_iterator, malformed syntax)
      // These are common in Drupal service files and don't affect LSP functionality
      return [];
    }
  }

  /**
   * Determine if service file is core, contrib, or custom
   */
  private determineSourceType(filePath: string): 'core' | 'contrib' | 'custom' {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();
    const relativePath = filePath.replace(drupalRoot, '');

    // Core: core/**/*.services.yml
    if (relativePath.includes('/core/')) {
      return 'core';
    }

    // Custom: modules/custom/**/*.services.yml
    if (relativePath.includes('/modules/custom/')) {
      return 'custom';
    }

    // Contrib: everything else (modules/contrib, themes, profiles, etc.)
    return 'contrib';
  }

  /**
   * Get cached services or parse if not cached
   */
  async getServices(filePath: string, useCache = true): Promise<DrupalService[]> {
    if (useCache && this.servicesCache.has(filePath)) {
      return this.servicesCache.get(filePath)!;
    }
    return this.parseFile(filePath);
  }

  /**
   * Find all service YAML files in Drupal installation
   * Scans: core, modules, themes for *.services.yml
   */
  async findAllServiceFiles(): Promise<string[]> {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();

    if (!fs.existsSync(drupalRoot)) {
      return [];
    }

    try {
      const files = await fg('**/*.services.yml', {
        cwd: drupalRoot,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/tests/**', '**/test/**']
      });

      return files;
    } catch (err) {
      console.error('Failed to find service files:', err);
      return [];
    }
  }

  /**
   * Find service files only in custom modules (for watching)
   * Scans: modules/custom/**\/*.services.yml
   */
  async findCustomModuleServiceFiles(): Promise<string[]> {
    const customModulesPath = this.drupalResolver.resolveDrupalPath('modules/custom');

    if (!fs.existsSync(customModulesPath)) {
      return [];
    }

    try {
      const files = await fg('**/*.services.yml', {
        cwd: customModulesPath,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/tests/**']
      });

      return files;
    } catch (err) {
      console.error('Failed to find custom module service files:', err);
      return [];
    }
  }

  /**
   * Scan and index all service files (one-time on startup)
   * Returns total number of indexed services
   */
  async scanAndIndex(): Promise<number> {
    const files = await this.findAllServiceFiles();

    for (const file of files) {
      await this.parseFile(file);
      this.scannedFiles.add(file);
    }

    // Return total services count
    return this.getAllServices().length;
  }

  /**
   * Get list of custom module service files for watching
   */
  async getCustomModuleFiles(): Promise<string[]> {
    return this.findCustomModuleServiceFiles();
  }

  /**
   * Check if file is in custom modules
   */
  isCustomModuleFile(filePath: string): boolean {
    const customModulesPath = this.drupalResolver.resolveDrupalPath('modules/custom');
    return filePath.startsWith(customModulesPath);
  }

  /**
   * Handle file change event (reindex single file)
   */
  async handleFileChange(filePath: string): Promise<void> {
    // Clear cache for this file
    this.clearCache(filePath);

    // Re-parse if it's a service file
    if (filePath.endsWith('.services.yml')) {
      await this.parseFile(filePath);
      this.scannedFiles.add(filePath);
    }
  }

  /**
   * Handle file delete event
   */
  handleFileDelete(filePath: string): void {
    this.clearCache(filePath);
    this.scannedFiles.delete(filePath);
  }

  /**
   * Clear cache for a specific file or all files
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.servicesCache.delete(filePath);
    } else {
      this.servicesCache.clear();
    }
  }

  /**
   * Get all cached service names
   */
  getAllServiceNames(): string[] {
    const names: string[] = [];
    for (const services of this.servicesCache.values()) {
      names.push(...services.map((s) => s.name));
    }
    return names;
  }

  /**
   * Get all services with their metadata
   */
  getAllServices(): DrupalService[] {
    const allServices: DrupalService[] = [];
    for (const services of this.servicesCache.values()) {
      allServices.push(...services);
    }
    return allServices;
  }

  /**
   * Find which file defines a service
   */
  findServiceFile(serviceName: string): string | null {
    for (const [filePath, services] of this.servicesCache.entries()) {
      if (services.some(s => s.name === serviceName)) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Get service by name with full metadata
   */
  getService(serviceName: string): DrupalService | null {
    for (const services of this.servicesCache.values()) {
      const service = services.find(s => s.name === serviceName);
      if (service) return service;
    }
    return null;
  }

  /**
   * Get Drupal root path (absolute)
   */
  getDrupalRoot(): string {
    return this.drupalResolver.getDrupalRootAbsolute();
  }
}
