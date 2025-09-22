import type { JSX } from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { enableRemoteAccess, disableRemoteAccess, fetchRemoteAccessStatus } from "@/services/remoteAccessService";
import { useRemoteAccessStore } from "@/stores/RemoteAccessStore";
import type { RemoteOriginOption } from "@/types/remote";
import { toast } from "sonner";

const ORIGIN_OPTIONS: Array<{ value: RemoteOriginOption; label: string; helper: string }> = [
  { value: "any", label: "Any host (0.0.0.0)", helper: "Accessible from the network" },
  { value: "localhost", label: "Localhost (127.0.0.1)", helper: "Restrict to this device" },
  { value: "direct", label: "Direct IPv6 (::)", helper: "Use IPv6 binding" },
];

export function RemoteAccessSettings(): JSX.Element {
  const { config, status, loading, setConfig, setStatus, setLoading } = useRemoteAccessStore();

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setLoading(true);
        const value = await fetchRemoteAccessStatus();
        setStatus(value);
      } catch (error) {
        console.error("Failed to fetch remote status", error);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, [setLoading, setStatus]);

  const handleStart = async () => {
    try {
      setLoading(true);
      const result = await enableRemoteAccess(config);
      setStatus(result);
      toast.success("Remote access enabled", {
        description: result.publicUrl
          ? `Clients can connect via ${result.publicUrl}`
          : "The remote server is running.",
      });
    } catch (error) {
      console.error("Failed to enable remote access", error);
      toast.error("Failed to enable remote access");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setLoading(true);
      const result = await disableRemoteAccess();
      setStatus(result);
      toast.success("Remote access disabled");
    } catch (error) {
      console.error("Failed to disable remote access", error);
      toast.error("Failed to disable remote access");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Remote Access</h2>
        <p className="text-muted-foreground">
          Expose Codexia over the network for remote browsers, tablets, or phones. The backend is
          served through Tauri Remote UI.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listener Configuration</CardTitle>
          <CardDescription>Choose how Codexia should expose its UI to remote clients.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="remote-port">Port</Label>
              <Input
                id="remote-port"
                type="number"
                min={1}
                max={65535}
                value={config.port ?? ""}
                onChange={(event) => {
                  const portValue = Number.parseInt(event.target.value, 10);
                  if (!Number.isNaN(portValue)) {
                    setConfig({ port: portValue });
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="remote-host">Public hostname</Label>
              <Input
                id="remote-host"
                placeholder="Optional hostname or IP advertised to clients"
                value={config.externalHost ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  setConfig({ externalHost: value.length ? value : undefined });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to reuse the binding address. Use this when exposing Codexia via a
                reverse proxy or different hostname.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Allowed origin</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {ORIGIN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-md border p-3 text-left transition-colors ${
                    config.allowedOrigin === option.value
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted/50"
                  }`}
                  onClick={() => setConfig({ allowedOrigin: option.value })}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.helper}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="bundle-path">Static bundle path</Label>
            <Input
              id="bundle-path"
              placeholder="Defaults to the built dist directory"
              value={config.bundlePath ?? ""}
              onChange={(event) => {
                const value = event.target.value.trim();
                setConfig({ bundlePath: value.length ? value : undefined });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Provide a custom directory if you serve a specific build. Leave blank to use the Tauri
              bundle output.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Minimize native window</p>
                <p className="text-xs text-muted-foreground">
                  Hide the window when remote mode is active.
                </p>
              </div>
              <Switch
                checked={config.minimizeApp}
                onCheckedChange={(checked) => setConfig({ minimizeApp: checked })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Keep native UI</p>
                <p className="text-xs text-muted-foreground">
                  Allow the Tauri window to remain usable alongside remote clients.
                </p>
              </div>
              <Switch
                checked={config.applicationUi}
                onCheckedChange={(checked) => setConfig({ applicationUi: checked })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Expose info endpoint</p>
                <p className="text-xs text-muted-foreground">
                  Publish diagnostics at /remote_ui_info for easier debugging.
                </p>
              </div>
              <Switch
                checked={config.enableInfoUrl}
                onCheckedChange={(checked) => setConfig({ enableInfoUrl: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server Status</CardTitle>
          <CardDescription>Manage the lifecycle of the remote UI bridge.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleStart} disabled={loading}>
              {loading ? "Starting…" : status?.running ? "Restart" : "Start"}
            </Button>
            <Button variant="outline" onClick={handleStop} disabled={loading || !status?.running}>
              Stop
            </Button>
            {status?.running && (
              <span className="text-sm text-muted-foreground">
                Listening on port {status.port ?? config.port}
              </span>
            )}
          </div>

          {status?.publicUrl && (
            <div className="space-y-2">
              <Label>Public URL</Label>
              <Input readOnly value={status.publicUrl} className="font-mono" />
            </div>
          )}

          {status?.infoUrl && (
            <div className="space-y-2">
              <Label>Info endpoint</Label>
              <Input readOnly value={status.infoUrl} className="font-mono" />
            </div>
          )}

          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Remote mode relies on the tauri-remote-ui plugin. Ensure your firewall allows incoming
            connections on the selected port and consider placing Codexia behind a secure reverse
            proxy for production deployments.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
