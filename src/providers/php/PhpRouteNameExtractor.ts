/**
 * Extracts route names from PHP code
 * Handles Drupal routing patterns:
 * - Url::fromRoute('route_name')
 * - $this->redirect('route_name')
 * - $this->setRedirect('route_name')
 * - new RedirectResponse(Url::fromRoute('route_name'))
 */
export class PhpRouteNameExtractor {

  /**
   * Check if line is in route context
   * More flexible - matches even when typing
   */
  isRouteContext(line: string): boolean {
    return /(?:Url::fromRoute|->redirect|->setRedirect|Link::createFromRoute)\s*\(\s*['"]/.test(line);
  }

  /**
   * Extract typed route name for autocomplete
   */
  getTypedRoute(line: string, character: number): string {
    let quoteStart = -1;
    for (let i = character - 1; i >= 0; i--) {
      if (line[i] === "'" || line[i] === '"') {
        quoteStart = i;
        break;
      }
    }

    if (quoteStart < 0) {
      return '';
    }

    return line.substring(quoteStart + 1, character);
  }
}
