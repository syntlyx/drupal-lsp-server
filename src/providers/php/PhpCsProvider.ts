import { Diagnostic, DiagnosticSeverity, Range, CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { PhpCsBinaryResolver } from '../../utils/PhpCsBinaryResolver';

const execAsync = promisify(exec);

interface PhpcsMessage {
  message: string;
  source: string;
  severity: number;
  type: string;
  line: number;
  column: number;
  fixable: boolean;
}

interface PhpcsFile {
  errors: number;
  warnings: number;
  messages: PhpcsMessage[];
}

interface PhpcsReport {
  files: {
    [filePath: string]: PhpcsFile;
  };
}

interface CacheEntry {
  version: number;
  diagnostics: Diagnostic[];
}

/**
 * Provider for PHPCS diagnostics and code actions
 */
export class PhpCsProvider {
  private resolver: PhpCsBinaryResolver;
  private readonly enabled: boolean = true;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(workspaceRoot: string, enabled: boolean = true) {
    this.resolver = new PhpCsBinaryResolver(workspaceRoot);
    this.enabled = enabled && this.resolver.isPhpcsAvailable();
  }

  /**
   * Get PHPCS diagnostics for document using stdin (faster)
   */
  async getDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    if (!this.enabled || !this.resolver.isPhpcsAvailable()) {
      return [];
    }

    // Check cache
    const cached = this.cache.get(document.uri);
    if (cached && cached.version === document.version) {
      return cached.diagnostics;
    }

    const phpcsPath = this.resolver.getPhpcsPath();
    if (!phpcsPath) return [];

    return new Promise((resolve) => {
      const standard = this.resolver.getStandard();
      const filePath = document.uri.replace('file://', '');
      const args = ['--report=json', '--no-colors', '-q', '--standard=' + standard, '--stdin-path=' + filePath, '-'];

      const phpcs = spawn(phpcsPath, args);
      let stdout = '';

      phpcs.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      phpcs.on('close', () => {
        let diagnostics: Diagnostic[] = [];
        if (stdout) {
          diagnostics = this.parsePhpcsOutput(stdout, document);
        }

        // Cache result
        this.cache.set(document.uri, {
          version: document.version,
          diagnostics
        });

        resolve(diagnostics);
      });

      phpcs.on('error', () => {
        resolve([]);
      });

      // Write document content to stdin
      phpcs.stdin.write(document.getText());
      phpcs.stdin.end();
    });
  }

  /**
   * Parse PHPCS JSON output to LSP Diagnostics
   */
  private parsePhpcsOutput(output: string, document: TextDocument): Diagnostic[] {
    try {
      const report: PhpcsReport = JSON.parse(output);
      const diagnostics: Diagnostic[] = [];

      const filePath = document.uri.replace('file://', '');
      const fileReport = report.files[filePath];

      if (!fileReport || !fileReport.messages) {
        return [];
      }

      for (const message of fileReport.messages) {
        const line = Math.max(0, message.line - 1);
        const col = Math.max(0, message.column - 1);

        const diagnostic: Diagnostic = {
          severity: message.type === 'ERROR' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range: Range.create(line, col, line, col + 1),
          message: message.message,
          source: `phpcs (${message.source})`,
          code: message.source
        };

        diagnostics.push(diagnostic);
      }

      return diagnostics;
    } catch (error) {
      console.error('Failed to parse phpcs output:', error);
      return [];
    }
  }

  /**
   * Get code actions (phpcbf auto-fix)
   */
  async getCodeActions(document: TextDocument, diagnostics: Diagnostic[]): Promise<CodeAction[]> {
    if (!this.enabled || !this.resolver.isPhpcbfAvailable()) {
      return [];
    }

    const phpcsActions = diagnostics.filter((d) => d.source?.startsWith('phpcs'));
    if (phpcsActions.length === 0) {
      return [];
    }

    const action: CodeAction = {
      title: 'Fix with phpcbf',
      kind: CodeActionKind.QuickFix,
      command: {
        title: 'Run phpcbf',
        command: 'drupalLsp.runPhpcbf',
        arguments: [document.uri]
      }
    };

    return [action];
  }

  /**
   * Run phpcbf to fix file
   */
  async fixFile(filePath: string): Promise<boolean> {
    if (!this.enabled || !this.resolver.isPhpcbfAvailable()) {
      return false;
    }

    const phpcbfPath = this.resolver.getPhpcbfPath();
    if (!phpcbfPath) return false;

    try {
      const standard = this.resolver.getStandard();
      const command = `${phpcbfPath} --standard="${standard}" "${filePath}"`;

      await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10
      });

      return true;
    } catch {
      // phpcbf returns exit code 1 if fixes were made
      // exit code 2 if fixable errors remain
      // We consider both as success
      return true;
    }
  }

  /**
   * Format document using phpcbf via stdin
   * Returns TextEdit to replace entire document
   */
  async formatDocument(document: TextDocument): Promise<TextEdit[] | null> {
    if (!this.enabled || !this.resolver.isPhpcbfAvailable()) {
      return null;
    }

    const phpcbfPath = this.resolver.getPhpcbfPath();
    if (!phpcbfPath) return null;

    return new Promise((resolve) => {
      const standard = this.resolver.getStandard();
      const args = ['-q', '--standard=' + standard, '--stdin-path=' + document.uri.replace('file://', ''), '-'];

      const phpcbf = spawn(phpcbfPath, args);
      let stdout = '';

      phpcbf.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      phpcbf.on('close', () => {
        // phpcbf returns 0 if no changes, 1 if fixed, 2 if errors remain
        const originalText = document.getText();

        const isValidOutput = stdout
          && stdout !== originalText
          && !stdout.includes('No violations')
          && !stdout.includes('Time:')
          && !stdout.includes('Memory:');

        if (isValidOutput) {
          const lines = originalText.split('\n');
          const lastLine = lines.length - 1;
          const lastChar = lines[lastLine].length;

          resolve([
            TextEdit.replace(
              Range.create(0, 0, lastLine, lastChar),
              stdout
            )
          ]);
        } else {
          resolve(null);
        }
      });

      phpcbf.on('error', () => {
        resolve(null);
      });

      // Write document content to stdin
      phpcbf.stdin.write(document.getText());
      phpcbf.stdin.end();
    });
  }

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
