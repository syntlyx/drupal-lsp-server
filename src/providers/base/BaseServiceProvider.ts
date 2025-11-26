import { DrupalService } from '../../parsers/YamlServiceParser';

/**
 * Base class for all service-related providers
 * Provides common utilities for working with Drupal services
 */
export abstract class BaseServiceProvider {
  /**
   * Filter valid service names for autocomplete
   * Removes class aliases and special directives
   */
  protected filterValidServices(services: DrupalService[]): DrupalService[] {
    return services.filter(service => {
      // Filter out class aliases (contain backslashes)
      if (service.name.includes('\\')) return false;

      // Filter out special directives (start with underscore)
      if (service.name.startsWith('_')) return false;

      return true;
    });
  }

  /**
   * Get service type label for display
   */
  protected getServiceTypeLabel(sourceType?: string): string {
    switch (sourceType) {
      case 'core': return '[Core]';
      case 'contrib': return '[Contrib]';
      case 'custom': return '[Custom]';
      default: return '[Unknown]';
    }
  }

  /**
   * Get sort prefix for service type
   * Custom = 0 (highest priority)
   * Contrib = 1
   * Core = 2
   * Unknown = 3 (lowest priority)
   */
  protected getSortPrefix(sourceType?: string): string {
    switch (sourceType) {
      case 'custom': return '0_';
      case 'contrib': return '1_';
      case 'core': return '2_';
      default: return '3_';
    }
  }

  /**
   * Build service detail string for display
   */
  protected buildServiceDetail(service: DrupalService): string {
    const label = this.getServiceTypeLabel(service.sourceType);
    return service.class ? `${label} ${service.class}` : label;
  }

  /**
   * Build service documentation string
   */
  protected buildServiceDocumentation(service: DrupalService): string {
    const lines = [`Service: ${service.name}`];

    if (service.class) {
      lines.push(`Class: ${service.class}`);
    }

    if (service.sourceType) {
      lines.push(`Source: ${service.sourceType}`);
    }

    return lines.join('\n');
  }
}
