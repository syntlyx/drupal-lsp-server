/**
 * Base class for extracting service names from text
 * Provides common logic for different languages
 */
export abstract class BaseServiceNameExtractor {
  /**
   * Extract service name at given character position
   * Returns service name or null if not found
   */
  abstract extractServiceName(line: string, character: number): string | null;

  /**
   * Check if position is inside DI container call
   * Returns true if we should provide service completions/definitions
   */
  abstract isServiceContext(line: string, character: number): boolean;
}
