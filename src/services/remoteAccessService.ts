import { invoke } from "@/lib/tauri-proxy";
import type { RemoteUiConfigInput, RemoteUiStatus } from "@/types/remote";

export async function enableRemoteAccess(
  config: RemoteUiConfigInput,
): Promise<RemoteUiStatus> {
  return invoke<RemoteUiStatus>("enable_remote_ui", { config });
}

export async function disableRemoteAccess(): Promise<RemoteUiStatus> {
  return invoke<RemoteUiStatus>("disable_remote_ui");
}

export async function fetchRemoteAccessStatus(): Promise<RemoteUiStatus> {
  return invoke<RemoteUiStatus>("get_remote_ui_status");
}
