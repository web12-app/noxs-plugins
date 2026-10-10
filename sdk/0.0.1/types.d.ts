/*
 * Noxs Plugin SDK 0.0.1 — TypeScript declarations (apiVersion 1).
 * Features: logging, ui, terminal.
 */

export as namespace NoxsSdk;

export interface SdkWindow {
  readonly id: string;
  show(): void;
  hide(): void;
  close(): void;
  setHTML(html: string): void;
  setText(selector: string, text: string): void;
  on(event: string, callback: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
}

export interface SdkWindowParams {
  title?: string;
  width?: number;
  height?: number;
  id?: string;
}

export interface SdkExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface NoxsSdkApi {
  /** The SDK release this object implements ("0.0.1"). */
  readonly version: string;
  /** The API generation ("1"). Plugins never mix generations. */
  readonly apiVersion: string;
  /** Feature identifiers provided by this SDK release. */
  readonly features: readonly string[];
  log: {
    info(message: unknown): void;
    warn(message: unknown): void;
    error(message: unknown): void;
  };
  ui: {
    createWindow(params?: SdkWindowParams): SdkWindow;
  };
  terminal: {
    exec(command: string): Promise<SdkExecResult>;
  };
}

declare global {
  interface Window {
    noxs: {
      sdk: NoxsSdkApi;
    };
  }
}
