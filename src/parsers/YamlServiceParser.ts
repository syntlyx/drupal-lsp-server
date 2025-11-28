import * as fs from 'fs';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import { DrupalProjectResolver } from '../utils/DrupalProjectResolver';
import { getCacheManager } from '../server';

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
 * Uses global cache with infinite TTL for service definitions
 * Scans modules/custom for *.services.yml files
 */
export class YamlServiceParser {
  private drupalResolver: DrupalProjectResolver;
  private scannedFiles: Set<string> = new Set();
  private readonly SERVICES_CACHE_PREFIX = 'yaml:services:';
  private readonly SERVICES_TTL = Infinity; // Never expire automatically

  constructor(drupalResolver: DrupalProjectResolver) {
    this.drupalResolver = drupalResolver;
  }

  /**
   * Parse services from the YAML file and cache with infinite TTL
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

      // Cache with infinite TTL
      const cache = getCacheManager();
      const cacheKey = this.SERVICES_CACHE_PREFIX + filePath;
      cache.set(cacheKey, services, this.SERVICES_TTL);
      
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
   * If cache is empty, triggers full reindex
   */
  async scanAndIndex(): Promise<number> {
    // Check if cache is empty - if yes, do full reindex
    const hasCache = this.scannedFiles.size > 0 && this.hasCachedServices();
    
    if (!hasCache) {
      const files = await this.findAllServiceFiles();

      for (const file of files) {
        await this.parseFile(file);
        this.scannedFiles.add(file);
      }
    }

    return this.getAllServices().length;
  }

  /**
   * Check if we have any cached services
   */
  private hasCachedServices(): boolean {
    return this.getAllServices().length > 0;
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
   * Clear cache for specific file or all files
   */
  clearCache(filePath?: string): void {
    const cache = getCacheManager();
    
    if (filePath) {
      const cacheKey = this.SERVICES_CACHE_PREFIX + filePath;
      cache.delete(cacheKey);
    } else {
      // Clear all service cache entries
      cache.clearPattern(this.SERVICES_CACHE_PREFIX + '*');
    }
  }

  /**
   * Get all cached service names
   */
  getAllServiceNames(): string[] {
    const names: string[] = [];
    const services = this.getAllServices();
    names.push(...services.map((s) => s.name));
    return names;
  }

  /**
   * Get all services with metadata from cache
   */
  getAllServices(): DrupalService[] {
    const cache = getCacheManager();
    const allServices: DrupalService[] = [];
    
    for (const filePath of this.scannedFiles) {
      const cacheKey = this.SERVICES_CACHE_PREFIX + filePath;
      const services = cache.get(cacheKey) as DrupalService[] | undefined;
      
      if (services) {
        allServices.push(...services);
      }
    }
    
    return allServices;
  }

  /**
   * Get service by name from cache
   */
  getService(serviceName: string): DrupalService | null {
    const cache = getCacheManager();
    
    for (const filePath of this.scannedFiles) {
      const cacheKey = this.SERVICES_CACHE_PREFIX + filePath;
      const services = cache.get(cacheKey) as DrupalService[] | undefined;
      
      if (services) {
        const service = services.find((s) => s.name === serviceName);
        if (service) return service;
      }
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
