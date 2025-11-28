# Drupal LSP Server

Language Server Protocol implementation for Drupal projects providing intelligent IDE support for YAML service definitions, PHP dependency injection patterns, and code quality tools.

## Features

### YAML Support

- **Autocomplete** for service references with smart sorting (Core/Contrib/Custom)
- **Autocomplete** for route references (`route:`, `route_name:`, `base_route:`)
- **Autocomplete** for parent links in menu/task/action links
- **Go-to-definition** for service references (jumps to YAML or PHP class)
- **Hover info** with clickable links to definitions
- **Diagnostics** for undefined service references
- **Diagnostics** for undefined route references
- **Diagnostics** for undefined parent links
- **Smart validation** - skips dynamic routes (view.*, rest.*, jsonapi.*)

### PHP Support

- **Autocomplete** for `\Drupal::service()` calls with pattern-aware suggestions
- **Autocomplete** for route references in routing methods:
  - `Url::fromRoute('route_name')`
  - `$this->redirect('route_name')`
  - `$variable->setRedirect('route_name', ['params'])`
  - `Link::createFromRoute('title', 'route_name')`
- **Go-to-definition** for DI container service strings
- **Hover info** with service details and clickable links
- **Diagnostics** for undefined services in DI patterns
- **Diagnostics** for undefined routes in routing methods
- **Smart pattern matching** - only triggers on legitimate container patterns, avoids false positives

### Code Quality

- **PHP_CodeSniffer integration** (phpcs/phpcbf)
  - Auto-detects phpcs.xml/phpcs.xml.dist in project root
  - Format document command with phpcbf
  - Real-time diagnostics integration

## Installation

```bash
npm install -g drupal-lsp-server
```

Or clone and build locally:

```bash
git clone https://github.com/syntlyx/drupal-lsp-server.git
cd drupal-lsp-server
npm install
npm run compile
npm link
```

## Architecture

Modular provider-based architecture for maintainability and extensibility:

```
src/
├── providers/           # LSP capability implementations
│   ├── yaml/           # YAML-specific providers
│   │   ├── YamlCompletionProvider.ts
│   │   ├── YamlDefinitionProvider.ts
│   │   ├── YamlDiagnosticProvider.ts
│   │   ├── YamlHoverProvider.ts
│   │   ├── YamlServiceNameExtractor.ts
│   │   └── YamlRouteNameExtractor.ts
│   ├── php/            # PHP-specific providers
│   │   ├── PhpCompletionProvider.ts
│   │   ├── PhpDefinitionProvider.ts
│   │   ├── PhpDiagnosticProvider.ts
│   │   ├── PhpHoverProvider.ts
│   │   ├── PhpCsProvider.ts
│   │   ├── PhpServiceNameExtractor.ts
│   │   └── PhpRouteNameExtractor.ts
│   ├── base/           # Base provider classes
│   ├── ICompletionProvider.ts
│   ├── IDefinitionProvider.ts
│   ├── IDiagnosticProvider.ts
│   └── IHoverProvider.ts
├── parsers/            # Service, route, and link parsers
│   ├── YamlServiceParser.ts
│   ├── YamlRouteParser.ts
│   ├── YamlLinkParser.ts
│   └── CommonEntityRoutes.ts
├── utils/              # Helper utilities
│   ├── DrupalProjectResolver.ts
│   ├── CacheManager.ts
│   └── PhpCsBinaryResolver.ts
├── types/              # TypeScript interfaces
│   └── ServerSettings.ts
└── server.ts           # Main LSP server
```

### Key Components

- **Providers**: Interface-based implementations for LSP features (completion, definition, diagnostics, hover)
- **Parsers**: YAML parsing for services, routes, and links with Core/Contrib/Custom categorization
- **DrupalProjectResolver**: Handles different Drupal installation patterns (root, web/, docroot/)
- **PhpCsProvider**: Integrates PHP_CodeSniffer for formatting and diagnostics
- **Route Support**: Comprehensive route autocomplete and validation with 90+ common entity routes

## Performance

- **Fast indexing**: ~3ms for 687 services, sub-second for route/link parsing
- **Smart caching**: Parsed services, routes, and links cached in memory with infinite TTL
- **Efficient pattern matching**: Regex-based with early exits to avoid false positives
- **Early Drupal detection**: Prevents running in non-Drupal projects
- **Real-time validation**: Works even while typing (closing quotes optional)

## Development

### Prerequisites

- Node.js 20+
- TypeScript 5.6+
- A Drupal 9/10/11 project for testing

### Build

```bash
npm install
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Lint

```bash
npm run lint
npm run lint:fix
```

## Roadmap

### Near-term

- [ ] Plugin/Module entity autocomplete
- [ ] Hook autocomplete and validation
- [ ] Form API autocomplete
- [ ] Entity field autocomplete
- [ ] Configuration entity autocomplete
- [ ] Twig template variable autocomplete

## Contributing

Contributions welcome! The codebase is designed for extensibility:

1. Each file type has its own provider directory
2. Providers implement consistent interfaces
3. Add new completions by creating new provider classes
4. Keep parsers separate from providers

## License

MIT License - see [LICENSE](LICENSE) file
