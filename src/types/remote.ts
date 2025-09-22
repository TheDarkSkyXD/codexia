export type RemoteOriginOption = "localhost" | "direct" | "any";

export interface RemoteUiConfigInput {
  port: number;
  allowedOrigin: RemoteOriginOption;
  minimizeApp: boolean;
  applicationUi: boolean;
  enableInfoUrl: boolean;
  bundlePath?: string;
  externalHost?: string;
}

export interface RemoteUiStatus {
  running: boolean;
  port: number | null;
  bindAddress: string | null;
  publicUrl: string | null;
  infoUrl: string | null;
  bundlePath: string | null;
  minimizeApp: boolean;
  applicationUi: boolean;
}
