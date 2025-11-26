/**
 * LSP Server Settings
 */
export interface ServerSettings {
  /** Enable/disable phpcs diagnostics */
  phpcs: {
    enabled: boolean;
  };
}

/**
 * Default server settings
 */
export const defaultSettings: ServerSettings = {
  phpcs: {
    enabled: true
  }
};
