import { BaseServiceNameExtractor } from '../base/BaseServiceNameExtractor';

/**
 * Extracts service names from PHP code
 * Handles Drupal DI patterns:
 * - \Drupal::service('service_name')
 * - $this->get('service_name')
 * - $container->get('service_name')
 */
export class PhpServiceNameExtractor extends BaseServiceNameExtractor {
  extractServiceName(line: string, character: number): string | null {
    // Pattern 1: ::service('service_name')
    const servicePattern = /::service\s*\(\s*['"]([a-z0-9._]+)['"]/gi;
    let match;

    while ((match = servicePattern.exec(line)) !== null) {
      if (this.isCharacterInMatch(match, character)) {
        return match[1];
      }
    }

    // Pattern 2: ->get('service_name')
    const getPattern = /(?:\$this|\$container|\$this->container)->get\s*\(\s*['"]([a-z0-9._]+)['"]/gi;

    while ((match = getPattern.exec(line)) !== null) {
      if (this.isCharacterInMatch(match, character)) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if character position is within the service name in match
   */
  private isCharacterInMatch(match: RegExpExecArray, character: number): boolean {
    const fullMatch = match[0];
    const serviceName = match[1];
    const matchStart = match.index;

    const singleQuotePos = fullMatch.indexOf("'");
    const doubleQuotePos = fullMatch.indexOf('"');
    const quotePos = singleQuotePos >= 0 ? singleQuotePos : doubleQuotePos;

    if (quotePos < 0) return false;

    const quoteStart = matchStart + quotePos;
    const serviceStart = quoteStart + 1;
    const serviceEnd = serviceStart + serviceName.length;
    const quoteEnd = serviceEnd + 1;

    return character >= quoteStart && character <= quoteEnd;
  }
}
