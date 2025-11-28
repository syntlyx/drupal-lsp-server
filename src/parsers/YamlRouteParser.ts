import * as fs from 'fs';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import { DrupalProjectResolver } from '../utils/DrupalProjectResolver';
import { getCacheManager } from '../server';
import { getCommonEntityRoutes } from './CommonEntityRoutes';

export interface DrupalRoute {
  name: string;
  path?: string;
  defaults?: {
    _controller?: string;
    _form?: string;
    _entity_form?: string;
    _title?: string;
    [key: string]: unknown;
  };
  requirements?: {
    _permission?: string;
    _access?: string;
    [key: string]: unknown;
  };
  sourceFile?: string;
  sourceLine?: string;
  sourceType?: 'core' | 'contrib' | 'custom';
}

interface YamlPair {
  key?: {
    value: string;
    range?: [number, number];
  };
  value: YAML.Node | unknown;
}

interface YamlRoutesNode {
  items?: YamlPair[];
}

/**
 * Parser for Drupal YAML routing files
 * Uses global cache with infinite TTL for route definitions
 * Scans for *.routing.yml files
 */
export class YamlRouteParser {
  private drupalResolver: DrupalProjectResolver;
  private scannedFiles: Set<string> = new Set();
  private readonly ROUTES_CACHE_PREFIX = 'yaml:routes:';
  private readonly ROUTES_TTL = Infinity;

  constructor(drupalResolver: DrupalProjectResolver) {
    this.drupalResolver = drupalResolver;
  }

  /**
   * Parse routes from YAML file and cache with infinite TTL
   */
  async parseFile(filePath: string): Promise<DrupalRoute[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCounter = new YAML.LineCounter();
      const parsed = YAML.parseDocument(content, { lineCounter });

      const routes: DrupalRoute[] = [];
      const sourceType = this.determineSourceType(filePath);

      // Routing files are flat (no 'routes:' key)
      const yamlNode = parsed.contents as YamlRoutesNode;
      if (!yamlNode || !yamlNode.items) {
        return [];
      }

      for (const pair of yamlNode.items) {
        const name = pair.key?.value;
        const definition = pair.value;

        if (!name || !definition) continue;

        let lineNumber: number | undefined;
        if (pair.key?.range) {
          const pos = lineCounter.linePos(pair.key.range[0]);
          lineNumber = pos.line;
        }

        let defObj: unknown = {};
        if (definition && typeof definition === 'object' && 'toJSON' in definition) {
          defObj = (definition as YAML.Node).toJSON();
        }

        if (defObj && typeof defObj === 'object') {
          const route = defObj as {
            path?: string;
            defaults?: DrupalRoute['defaults'];
            requirements?: DrupalRoute['requirements'];
          };

          routes.push({
            name,
            path: route.path,
            defaults: route.defaults,
            requirements: route.requirements,
            sourceFile: filePath,
            sourceType: sourceType,
            sourceLine: lineNumber?.toString()
          });
        }
      }

      const cache = getCacheManager();
      const cacheKey = this.ROUTES_CACHE_PREFIX + filePath;
      cache.set(cacheKey, routes, this.ROUTES_TTL);

      return routes;
    } catch (error) {
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

    if (relativePath.includes('/core/')) return 'core';
    if (relativePath.includes('/modules/custom/')) return 'custom';
    return 'contrib';
  }

  /**
   * Find all routing YAML files
   */
  async findAllRoutingFiles(): Promise<string[]> {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();
    if (!fs.existsSync(drupalRoot)) return [];

    try {
      return await fg('**/*.routing.yml', {
        cwd: drupalRoot,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/tests/**', '**/test/**']
      });
    } catch (err) {
      console.error('Failed to find routing files:', err);
      return [];
    }
  }

  /**
   * Scan and index all routing files
   */
  async scanAndIndex(): Promise<number> {
    const hasCache = this.scannedFiles.size > 0 && this.hasCachedRoutes();

    if (!hasCache) {
      const files = await this.findAllRoutingFiles();
      for (const file of files) {
        await this.parseFile(file);
        this.scannedFiles.add(file);
      }
    }

    return this.getAllRoutes().length;
  }

  private hasCachedRoutes(): boolean {
    return this.getAllRoutes().length > 0;
  }

  async handleFileChange(filePath: string): Promise<void> {
    this.clearCache(filePath);
    if (filePath.endsWith('.routing.yml')) {
      await this.parseFile(filePath);
      this.scannedFiles.add(filePath);
    }
  }

  handleFileDelete(filePath: string): void {
    this.clearCache(filePath);
    this.scannedFiles.delete(filePath);
  }

  clearCache(filePath?: string): void {
    const cache = getCacheManager();
    if (filePath) {
      cache.delete(this.ROUTES_CACHE_PREFIX + filePath);
    } else {
      cache.clearPattern(this.ROUTES_CACHE_PREFIX + '*');
    }
  }

  getAllRouteNames(): string[] {
    const routes = this.getAllRoutes().map((r) => r.name);
    const commonRoutes = getCommonEntityRoutes();
    // Combine and deduplicate
    return [...new Set([...routes, ...commonRoutes])];
  }

  getAllRoutes(): DrupalRoute[] {
    const cache = getCacheManager();
    const allRoutes: DrupalRoute[] = [];

    // Get routes from .routing.yml files
    for (const filePath of this.scannedFiles) {
      const cacheKey = this.ROUTES_CACHE_PREFIX + filePath;
      const routes = cache.get(cacheKey) as DrupalRoute[] | undefined;
      if (routes) allRoutes.push(...routes);
    }

    // Add common entity routes
    const commonRouteNames = getCommonEntityRoutes();
    for (const routeName of commonRouteNames) {
      // Only add if not already in the list (avoid duplicates)
      if (!allRoutes.find((r) => r.name === routeName)) {
        allRoutes.push({
          name: routeName,
          sourceType: 'core'
        });
      }
    }

    return allRoutes;
  }

  getDrupalRoot(): string {
    return this.drupalResolver.getDrupalRootAbsolute();
  }
}
