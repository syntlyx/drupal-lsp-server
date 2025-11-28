import * as fs from 'fs';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import { DrupalProjectResolver } from '../utils/DrupalProjectResolver';

export interface DrupalService {
  name: string;
  class?: string;
  parent?: string;
  arguments?: string[];
  factory?: string | string[];
  sourceFile?: string; // Path to .services.yml file
  sourceLine?: string;
  sourceType?: 'core' | 'contrib' | 'custom'; // Service origin
}

interface YamlServiceDefinition {
  class?: string;
  parent?: string;
  arguments?: unknown[];
  factory?: string | string[];
  alias?: string;
  [key: string]: unknown;
}

interface YamlPair {
  key?: {
    value: string;
    range?: [number, number];
  };
  value: YAML.Node | string;
}

interface YamlServicesNode {
  items?: YamlPair[];
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
   * Parse services from the YAML file
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
      const yamlNode = servicesNode as YamlServicesNode;
      for (const pair of yamlNode.items || []) {
        const name = pair.key?.value;
        const definition = pair.value;

        if (!name || !definition) continue;

        // Get line number from YAML node
        let lineNumber: number | undefined;
        if (pair.key?.range) {
          const pos = lineCounter.linePos(pair.key.range[0]);
          lineNumber = pos.line;
        }

        // Handle both object definitions and aliases
        let defObj: YamlServiceDefinition = {};
        if (typeof definition === 'string') {
          defObj = { alias: definition };
        } else if (definition && typeof definition === 'object' && 'toJSON' in definition) {
          const json = (definition as YAML.Node).toJSON();
          defObj = json as YamlServiceDefinition;
        }

        if (defObj) {
          services.push({
            name,
            class: defObj.class,
            parent: defObj.parent,
            arguments: defObj.arguments as string[] | undefined,
            factory: defObj.factory,
            sourceFile: filePath,
            sourceType: sourceType,
            sourceLine: lineNumber?.toString()
          });
        }
      }

      this.servicesCache.set(filePath, services);
      return services;
    } catch (error) {
      // Silently ignore YAML parse errors
      console.error(error);
      return [];
    }
  }

  /**
   * Determine if a service file is core, contrib, or custom
   */
  private determineSourceType(filePath: string): 'core' | 'contrib' | 'custom' {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();
    const relativePath = filePath.replace(drupalRoot, '');

    if (relativePath.includes('/core/')) {
      return 'core';
    }

    if (relativePath.includes('/modules/custom/')) {
      return 'custom';
    }

    return 'contrib';
  }

  /**
   * Find all service YAML files in Drupal installation
   */
  async findAllServiceFiles(): Promise<string[]> {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();

    if (!fs.existsSync(drupalRoot)) {
      return [];
    }

    try {
      return await fg('**/*.services.yml', {
        cwd: drupalRoot,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/tests/**', '**/test/**']
      });
    } catch (err) {
      console.error('Failed to find service files:', err);
      return [];
    }
  }

  /**
   * Scan and index all service files
   */
  async scanAndIndex(): Promise<number> {
    const files = await this.findAllServiceFiles();

    for (const file of files) {
      await this.parseFile(file);
      this.scannedFiles.add(file);
    }

    return this.getAllServices().length;
  }

  /**
   * Handle file change event
   */
  async handleFileChange(filePath: string): Promise<void> {
    this.clearCache(filePath);

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
   * Clear cache
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
   * Get all services with metadata
   */
  getAllServices(): DrupalService[] {
    const allServices: DrupalService[] = [];
    for (const services of this.servicesCache.values()) {
      allServices.push(...services);
    }
    return allServices;
  }

  /**
   * Get service by name
   */
  getService(serviceName: string): DrupalService | null {
    for (const services of this.servicesCache.values()) {
      const service = services.find((s) => s.name === serviceName);
      if (service) return service;
    }
    return null;
  }

  /**
   * Get Drupal root path
   */
  getDrupalRoot(): string {
    return this.drupalResolver.getDrupalRootAbsolute();
  }
}
