/**
 * Extracts route names from YAML files
 * Handles Drupal route patterns in links.*.yml and other files
 */
export class YamlRouteNameExtractor {
  /**
   * Check if line is in route context (has "route:", "route_name:", or "base_route:" key)
   * More flexible - matches even if nothing typed yet
   */
  isRouteContext(line: string): boolean {
    return /\s*(?:route_name|route|base_route):\s*['"]?[a-z0-9._]*$/.test(line);
  }

  /**
   * Extract typed route name for autocomplete
   */
  getTypedRoute(line: string): string {
    const match = line.match(/\s*(?:route_name|route|base_route):\s*['"]?([a-z0-9._]*)$/);
    return match ? match[1] : '';
  }
}
