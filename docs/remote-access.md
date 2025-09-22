# Remote Access

Codexia now ships with an optional remote-access mode built on top of the [`tauri-remote-ui`](../plugins/tauri-remote-ui/README.md) plugin. When enabled, the desktop application exposes its full UI over HTTP/WebSocket so that you can operate Codexia from another computer, phone, or tablet using any modern browser.

## Enabling the Remote UI bridge

1. Open **Settings → Remote Access** inside the Codexia desktop client.
2. Choose the listener **port**, allowed **origin**, and whether to minimise or keep the native window active.
3. Optionally specify a **public hostname** if Codexia sits behind a reverse proxy (for example `codexia.your-domain.dev`).
4. Click **Start** to launch the embedded HTTP/WebSocket server. The UI shows the public URL that remote browsers can use. Share this URL over a secure channel only.

Behind the scenes the command `enable_remote_ui` configures the Tauri plugin and persists a snapshot of the active configuration in the `RemoteAccessState`. The application fallbacks to local Tauri IPC automatically when the remote bridge is unavailable, so normal desktop usage is unaffected.

## FastAPI bridge (optional)

Some deployments prefer a traditional HTTP API in front of the remote bridge, for example to integrate with an existing auth layer or to expose Codexia without sharing the raw `tauri-remote-ui` WebSocket. The repository now includes a lightweight FastAPI project under `remote-server/` that does exactly that:

- exposes `POST /invoke` to forward arbitrary Tauri commands through the remote WebSocket
- publishes `GET /health` and `GET /remote/status` helpers
- uses environment variables (`CODEXIA_REMOTE_WS`, `CODEXIA_REMOTE_URL`) to target the Codexia host

### Running the FastAPI bridge

```bash
cd remote-server
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn codexia_remote.app:app --host 0.0.0.0 --port 8008
```

Once running you can hit `http://<server>:8008/remote/status` to read the current bridge state or forward commands by posting to `/invoke`:

```bash
curl -X POST http://<server>:8008/invoke \
  -H "Content-Type: application/json" \
  -d '{"command":"get_remote_ui_status"}'
```

The bridge keeps every call isolated—each HTTP request opens a short-lived WebSocket session to Codexia, relays the invocation, and propagates the JSON response back to the client. If you need streaming or long-running workflows you can extend the FastAPI app with proper authentication, timeouts, and caching strategies.

## Security checklist

- Always run remote deployments behind TLS/HTTPS.
- Consider restricting `allowedOrigin` to `localhost` when testing, then switch to `any` only when the port is protected by a firewall or proxy.
- Use the FastAPI bridge (or any reverse proxy) to add authentication and request rate limiting before exposing Codexia to the internet.
- Verify the `/remote_ui_info` diagnostics endpoint is disabled in production if you do not wish to leak environment details.

With these pieces Codexia can operate as a thin server that multiple browsers connect to from anywhere, while the heavy tooling remains on the host machine.
