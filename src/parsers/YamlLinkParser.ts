import * as fs from 'fs';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import { DrupalProjectResolver } from '../utils/DrupalProjectResolver';
import { getCacheManager } from '../server';

export interface DrupalLink {
  name: string;
  title?: string;
  parent?: string;
  route_name?: string;
  appears_on?: string[];  // List of routes where this link appears
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

interface YamlLinksNode {
  items?: YamlPair[];
}

/**
 * Parser for Drupal YAML links files
 * Parses *.links.*.yml files to validate parent references
 */
export class YamlLinkParser {
  private drupalResolver: DrupalProjectResolver;
  private scannedFiles: Set<string> = new Set();
  private readonly LINKS_CACHE_PREFIX = 'yaml:links:';
  private readonly LINKS_TTL = Infinity;

  constructor(drupalResolver: DrupalProjectResolver) {
    this.drupalResolver = drupalResolver;
  }

  /**
   * Parse links from YAML file
   */
  async parseFile(filePath: string): Promise<DrupalLink[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCounter = new YAML.LineCounter();
      const parsed = YAML.parseDocument(content, { lineCounter });

      const links: DrupalLink[] = [];
      const sourceType = this.determineSourceType(filePath);

      const yamlNode = parsed.contents as YamlLinksNode;
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
          const link = defObj as { 
            title?: string; 
            parent?: string; 
            route_name?: string;
            appears_on?: string | string[];  // Can be single string or array
          };

          // Normalize appears_on to always be an array
          let appearsOn: string[] | undefined;
          if (link.appears_on) {
            appearsOn = Array.isArray(link.appears_on) ? link.appears_on : [link.appears_on];
          }

          links.push({
            name,
            title: link.title,
            parent: link.parent,
            route_name: link.route_name,
            appears_on: appearsOn,
            sourceFile: filePath,
            sourceType: sourceType,
            sourceLine: lineNumber?.toString()
          });
        }
      }

      const cache = getCacheManager();
      const cacheKey = this.LINKS_CACHE_PREFIX + filePath;
      cache.set(cacheKey, links, this.LINKS_TTL);

      return links;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private determineSourceType(filePath: string): 'core' | 'contrib' | 'custom' {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();
    const relativePath = filePath.replace(drupalRoot, '');

    if (relativePath.includes('/core/')) return 'core';
    if (relativePath.includes('/modules/custom/')) return 'custom';
    return 'contrib';
  }

  /**
   * Find all links YAML files
   */
  async findAllLinksFiles(): Promise<string[]> {
    const drupalRoot = this.drupalResolver.getDrupalRootAbsolute();
    if (!fs.existsSync(drupalRoot)) return [];

    try {
      return await fg('**/*.links.*.yml', {
        cwd: drupalRoot,
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/tests/**', '**/test/**']
      });
    } catch (err) {
      console.error('Failed to find links files:', err);
      return [];
    }
  }

  async scanAndIndex(): Promise<number> {
    const hasCache = this.scannedFiles.size > 0 && this.hasCachedLinks();

    if (!hasCache) {
      const files = await this.findAllLinksFiles();
      for (const file of files) {
        await this.parseFile(file);
        this.scannedFiles.add(file);
      }
    }

    return this.getAllLinks().length;
  }

  private hasCachedLinks(): boolean {
    return this.getAllLinks().length > 0;
  }

  async handleFileChange(filePath: string): Promise<void> {
    this.clearCache(filePath);
    if (filePath.includes('.links.')) {
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
      cache.delete(this.LINKS_CACHE_PREFIX + filePath);
    } else {
      cache.clearPattern(this.LINKS_CACHE_PREFIX + '*');
    }
  }

  getAllLinkNames(): string[] {
    return this.getAllLinks().map((l) => l.name);
  }

  getAllLinks(): DrupalLink[] {
    const cache = getCacheManager();
    const allLinks: DrupalLink[] = [];

    for (const filePath of this.scannedFiles) {
      const cacheKey = this.LINKS_CACHE_PREFIX + filePath;
      const links = cache.get(cacheKey) as DrupalLink[] | undefined;
      if (links) allLinks.push(...links);
    }

    return allLinks;
  }

  getDrupalRoot(): string {
    return this.drupalResolver.getDrupalRootAbsolute();
  }
}
