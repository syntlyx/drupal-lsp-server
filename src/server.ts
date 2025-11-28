import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DefinitionParams,
  Definition,
  HoverParams,
  Hover,
  CodeActionParams,
  CodeAction,
  ExecuteCommandParams,
  DocumentFormattingParams,
  TextEdit
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ICompletionProvider } from './providers/ICompletionProvider';
import { IDefinitionProvider } from './providers/IDefinitionProvider';
import { IDiagnosticProvider } from './providers/IDiagnosticProvider';
import { IHoverProvider } from './providers/IHoverProvider';
import { YamlServiceParser } from './parsers/YamlServiceParser';
import { DrupalProjectResolver } from './utils/DrupalProjectResolver';
import { PhpCsProvider } from './providers/php/PhpCsProvider';
import { ServerSettings, defaultSettings } from './types/ServerSettings';
import { YamlCompletionProvider } from './providers/yaml/YamlCompletionProvider';
import { PhpCompletionProvider } from './providers/php/PhpCompletionProvider';
import { YamlDefinitionProvider } from './providers/yaml/YamlDefinitionProvider';
import { YamlDiagnosticProvider } from './providers/yaml/YamlDiagnosticProvider';
import { YamlHoverProvider } from './providers/yaml/YamlHoverProvider';
import { PhpDefinitionProvider } from './providers/php/PhpDefinitionProvider';
import { PhpDiagnosticProvider } from './providers/php/PhpDiagnosticProvider';
import { PhpHoverProvider } from './providers/php/PhpHoverProvider';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let workspaceRoot: string | undefined;
let drupalResolver: DrupalProjectResolver;
let yamlServiceParser: YamlServiceParser;
let phpCsProvider: PhpCsProvider;
const serverSettings: ServerSettings = defaultSettings;

export function getYamlServiceParser(): YamlServiceParser {
  return yamlServiceParser;
}

export function getPhpCsProvider(): PhpCsProvider {
  return phpCsProvider;
}

/**
 * Check if file path is in custom code (not core/contrib)
 * Features like formatting/diagnostics should only run on custom code
 */
export function isCustomCode(filePath: string): boolean {
  return !filePath.includes('/core/') && !filePath.includes('/modules/contrib/');
}

// Providers registry
const completionProviders: ICompletionProvider[] = [];
const definitionProviders: IDefinitionProvider[] = [];
const diagnosticProviders: IDiagnosticProvider[] = [];
const hoverProviders: IHoverProvider[] = [];

connection.onInitialize(async (params: InitializeParams) => {
  // Use workspaceFolders instead of deprecated rootUri
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = params.workspaceFolders[0].uri.replace('file://', '');
  }

  if (!workspaceRoot) {
    connection.console.error('No workspace root found');
    return {
      capabilities: {}
    };
  }

  // Initialize Drupal resolver and check if it's a Drupal project
  drupalResolver = new DrupalProjectResolver(workspaceRoot);

  if (!drupalResolver.isDrupalDetected()) {
    connection.console.warn(
      `Drupal root not detected in ${workspaceRoot}. LSP server will not provide features.`
    );
    return {
      capabilities: {}
    };
  }

  // Drupal detected - log and initialize everything
  connection.console.log(
    `Drupal detected at: ${drupalResolver.getDrupalRoot() || 'root'}`
  );

  if (workspaceRoot) {
    yamlServiceParser = new YamlServiceParser(drupalResolver);
    phpCsProvider = new PhpCsProvider(workspaceRoot, serverSettings.phpcs.enabled);

    // Initialize YAML service parser - AWAIT to ensure indexing completes
    try {
      const servicesCount = await yamlServiceParser.scanAndIndex();
      connection.console.log(`Indexed ${servicesCount} services`);
    } catch (err) {
      connection.console.error(`Failed to index service files: ${err}`);
    }

    // Check phpcs availability
    if (phpCsProvider.isEnabled()) {
      connection.console.log('phpcs/phpcbf detected and enabled');
    } else if (!serverSettings.phpcs.enabled) {
      connection.console.log('phpcs disabled via settings');
    }

    // Register providers
    completionProviders.push(new YamlCompletionProvider());
    completionProviders.push(new PhpCompletionProvider());
    definitionProviders.push(new YamlDefinitionProvider());
    definitionProviders.push(new PhpDefinitionProvider());
    diagnosticProviders.push(new YamlDiagnosticProvider());
    diagnosticProviders.push(new PhpDiagnosticProvider());
    hoverProviders.push(new YamlHoverProvider());
    hoverProviders.push(new PhpHoverProvider());
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', ':', '\\', '(']
      },
      definitionProvider: true,
      hoverProvider: true,
      documentFormattingProvider: true,
      codeActionProvider: true,
      executeCommandProvider: {
        commands: ['drupalLsp.runPhpcbf']
      },
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      }
    }
  };

  return result;
});

// Completion handler
connection.onCompletion(
  async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const results: CompletionItem[] = [];

    if (!isCustomCode(document.uri)) {
      return results;
    }

    for (const provider of completionProviders) {
      if (provider.canProvide(document, params.position)) {
        try {
          const items = await provider.provideCompletions(
            document,
            params.position
          );
          results.push(...items);
        } catch (err) {
          connection.console.error(`Completion error: ${err}`);
        }
      }
    }

    return results;
  }
);

// Definition handler (go-to-definition)
connection.onDefinition(
  async (params: DefinitionParams): Promise<Definition | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    for (const provider of definitionProviders) {
      if (provider.canProvide(document, params.position)) {
        try {
          const result = await provider.provideDefinition(
            document,
            params.position
          );
          if (result) return result;
        } catch (err) {
          connection.console.error(`Definition error: ${err}`);
        }
      }
    }

    return null;
  }
);

// Hover handler
connection.onHover(
  async (params: HoverParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    for (const provider of hoverProviders) {
      if (provider.canProvide(document, params.position)) {
        try {
          const result = await provider.provideHover(
            document,
            params.position
          );
          if (result) return result;
        } catch (err) {
          connection.console.error(`Hover error: ${err}`);
        }
      }
    }

    return null;
  }
);

// Document change handler - reindex YAML service files (only custom modules)
documents.onDidChangeContent(async (change) => {
  const uri = change.document.uri;
  const filePath = uri.replace('file://', '');

  // Only reindex if it's a .services.yml file in custom code
  if (filePath.endsWith('.services.yml') && yamlServiceParser) {
    if (isCustomCode(filePath)) {
      await yamlServiceParser.handleFileChange(filePath).catch((err) => {
        connection.console.error(`Failed to reindex ${filePath}: ${err}`);
      });
    }
  }
});

// File system watchers for new/deleted service files
connection.onDidChangeWatchedFiles(async (change) => {
  for (const event of change.changes) {
    const filePath = event.uri.replace('file://', '');

    if (!filePath.endsWith('.services.yml')) continue;
    if (!yamlServiceParser) continue;
    if (!isCustomCode(filePath)) continue;

    // Handle file creation or modification
    if (event.type === 1 || event.type === 2) { // Created or Changed
      await yamlServiceParser.handleFileChange(filePath).catch((err) => {
        connection.console.error(`Failed to reindex ${filePath}: ${err}`);
      });
      connection.console.log(`Reindexed: ${filePath}`);
    }

    // Handle file deletion
    if (event.type === 3) { // Deleted
      yamlServiceParser.handleFileDelete(filePath);
      connection.console.log(`Removed from index: ${filePath}`);
    }
  }
});

// Pull Diagnostics handler (LSP 3.17)
connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isCustomCode(document.uri)) {
    return { kind: 'full' as const, items: [] };
  }

  const diagnostics = [];
  for (const provider of diagnosticProviders) {
    if (provider.canProvide(document)) {
      try {
        const results = await provider.provideDiagnostics(document);
        diagnostics.push(...results);
      } catch (err) {
        connection.console.error(`Diagnostic error: ${err}`);
      }
    }
  }

  return { kind: 'full' as const, items: diagnostics };
});

// Code Action handler (for phpcbf fixes)
connection.onCodeAction(
  async (params: CodeActionParams): Promise<CodeAction[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!phpCsProvider || !phpCsProvider.isEnabled() || !isCustomCode(document.uri)) {
      return [];
    }

    try {
      return await phpCsProvider.getCodeActions(
        document,
        params.context.diagnostics
      );
    } catch (err) {
      connection.console.error(`Code action error: ${err}`);
      return [];
    }
  }
);

// Execute Command handler (runs phpcbf)
connection.onExecuteCommand(
  async (params: ExecuteCommandParams): Promise<void> => {
    if (params.command === 'drupalLsp.runPhpcbf' && params.arguments) {
      const uri = params.arguments[0] as string;
      const filePath = uri.replace('file://', '');

      try {
        if (phpCsProvider) {
          await phpCsProvider.fixFile(filePath);
          connection.console.log(`phpcbf fixed: ${filePath}`);
          // Client will re-request diagnostics automatically
        }
      } catch (err) {
        connection.console.error(`phpcbf failed: ${err}`);
      }
    }
  }
);

// Document Formatting handler (format on save)
connection.onDocumentFormatting(
  async (params: DocumentFormattingParams): Promise<TextEdit[] | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    // Only format PHP files
    if (!document.uri.endsWith('.php')) {
      return null;
    }

    if (!phpCsProvider || !phpCsProvider.isEnabled() || !isCustomCode(document.uri)) {
      return null;
    }

    try {
      const edits = await phpCsProvider.formatDocument(document);

      if (edits && edits.length > 0) {
        connection.console.log(`Formatted: ${document.uri}`);
      }

      return edits;
    } catch (err) {
      connection.console.error(`Format failed: ${err}`);
      return null;
    }
  }
);

// Settings change handler
connection.onDidChangeConfiguration((change) => {
  if (change.settings && change.settings.drupalLsp) {
    const newSettings = change.settings.drupalLsp as Partial<ServerSettings>;

    // Update phpcs enabled state
    if (newSettings.phpcs !== undefined) {
      serverSettings.phpcs.enabled = newSettings.phpcs.enabled;

      // Reinitialize phpCsProvider with new settings
      if (workspaceRoot) {
        phpCsProvider = new PhpCsProvider(workspaceRoot, serverSettings.phpcs.enabled);
        connection.console.log(`phpcs ${serverSettings.phpcs.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  }
});

documents.listen(connection);
connection.listen();
