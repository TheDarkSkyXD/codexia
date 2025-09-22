# Codexia Remote Bridge

This FastAPI application exposes a thin HTTP facade for the Codexia remote UI plugin. It connects to the WebSocket endpoint served by the desktop app (`/remote_ui_ws`) and forwards invocations over HTTP so you can integrate Codexia with reverse proxies, additional authentication layers, or third-party tooling.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn codexia_remote.app:app --host 0.0.0.0 --port 8008 --reload
```

By default the bridge targets `ws://127.0.0.1:7420/remote_ui_ws`. Override the defaults with environment variables:

```bash
export CODEXIA_REMOTE_WS="ws://codexia-host:7420/remote_ui_ws"
export CODEXIA_REMOTE_HTTP_URL="http://codexia-host:7420"
export CODEXIA_REQUEST_TIMEOUT=45
```

## Endpoints

- `GET /health` – Liveness probe
- `GET /remote/status` – Returns the latest `get_remote_ui_status` payload
- `POST /invoke` – Forwards a JSON RPC command to Codexia, accepts `{ "command": "get_remote_ui_status", "args": { ... } }`

Each HTTP request opens a new WebSocket session, relays the invocation, and returns the JSON payload emitted by Codexia. Integrate your own authentication, TLS termination, or caching on top of this blueprint as needed.
