import asyncio
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .client import RemoteBridgeClient, RemoteInvocationError
from .settings import settings

app = FastAPI(title="Codexia Remote Bridge", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_client = RemoteBridgeClient(settings.remote_ws_url, timeout=settings.request_timeout)


class InvokeRequest(BaseModel):
    command: str
    args: Optional[Dict[str, Any]] = None
    options: Optional[Dict[str, Any]] = None


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/remote/status")
async def remote_status() -> Dict[str, Any]:
    try:
        status = await _client.fetch_status()
        return {"status": status}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/invoke")
async def invoke(payload: InvokeRequest) -> Dict[str, Any]:
    try:
        result = await _client.invoke(payload.command, payload.args, payload.options)
        return {"status": "success", "payload": result}
    except RemoteInvocationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Remote invocation timed out") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
