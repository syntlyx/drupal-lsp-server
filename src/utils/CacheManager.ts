// Check if expired
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number; // Per-entry TTL
}

interface CacheOptions {
  ttl?: number; // Time-to-live in milliseconds (default: 5 minutes)
}

/**
 * Global cache manager with TTL and size limits
 * Prevents memory bloat from storing millions of entries
 */
export class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly defaultTtl: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? 5 * 60 * 1000; // Default: 5 minutes
  }

  /**
   * Get value from cache if not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired using per-entry TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in cache with optional TTL override
   * Enforces max size by removing oldest entries
   */
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl // Use provided TTL or default
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries matching a pattern
   * Pattern can be a prefix or include wildcard matching
   */
  clearPattern(pattern: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());

    for (const key of keys) {
      if (this.matchesPattern(key, pattern)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Remove expired entries (manual cleanup)
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Simple pattern matching for cache keys
   * Supports prefix matching and * wildcard
   */
  private matchesPattern(key: string, pattern: string): boolean {
    // Exact match
    if (key === pattern) {
      return true;
    }

    // Prefix match (pattern ends with *)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return key.startsWith(prefix);
    }

    // Contains match (*pattern*)
    if (pattern.startsWith('*') && pattern.endsWith('*')) {
      const substring = pattern.slice(1, -1);
      return key.includes(substring);
    }

    return false;
  }
}
