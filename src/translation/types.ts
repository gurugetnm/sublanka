/**
 * Provider-neutral translation types. The job runner and the popup only see these, so another engine
 * (a proxy, a local model) can replace Google Cloud Translation without touching the pipeline.
 */

export interface TranslationProvider {
  id: string;
  name: string;
  /** Most segments one request may carry. */
  maxSegments: number;
  /** Most characters one request should carry. */
  maxChars: number;
  /** Whether the user has finished setup; false means translate() throws 'setup-required'. */
  isConfigured(): Promise<boolean>;
  /**
   * English → Sinhala. Returns exactly one translation per input, in input order, or throws ProviderError.
   * Inputs are plain text; outputs are plain text, never HTML.
   */
  translate(texts: string[], signal: AbortSignal): Promise<string[]>;
}
