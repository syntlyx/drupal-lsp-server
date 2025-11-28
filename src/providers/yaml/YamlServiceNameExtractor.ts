import { BaseServiceNameExtractor } from '../base/BaseServiceNameExtractor';

/**
 * Extracts service names from YAML files
 * Handles Drupal YAML patterns in .services.yml files
 */
export class YamlServiceNameExtractor extends BaseServiceNameExtractor {
  extractServiceName(line: string, character: number): string | null {
    // In YAML, service names are keys at service level
    // Example: "  my_service:"
    const match = line.match(/^\s{2}([a-z0-9._]+):\s*$/);
    if (match) {
      return match[1];
    }

    // Check for @ references in arguments - find ALL matches
    // Example: "- '@service_one', '@service_two', '@service_three'"
    const regex = /@([a-z0-9._]+)/g;
    let argMatch;

    while ((argMatch = regex.exec(line)) !== null) {
      const serviceName = argMatch[1];
      const atPos = argMatch.index;
      const serviceStart = atPos + 1; // After @
      const serviceEnd = serviceStart + serviceName.length;

      // Check if cursor is within this service reference
      if (character >= atPos && character <= serviceEnd) {
        return serviceName;
      }
    }

    return null;
  }
}
