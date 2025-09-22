import asyncio
import json
import itertools
from typing import Any, Dict, Optional

import websockets


class RemoteInvocationError(Exception):
    """Raised when the remote bridge returns an error payload."""

    def __init__(self, command: str, payload: Any):
        super().__init__(f"Remote command '{command}' failed: {payload}")
        self.command = command
        self.payload = payload


class RemoteBridgeClient:
    """Thin WebSocket client that forwards commands to the Codexia remote UI."""

    def __init__(self, ws_url: str, timeout: int = 30) -> None:
        self._ws_url = ws_url
        self._timeout = timeout
        self._id_sequence = itertools.count(1)

    async def invoke(
        self,
        command: str,
        args: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Any:
        request_id = next(self._id_sequence)
        payload = {"id": request_id, "cmd": command, "args": args, "option": options}

        async with websockets.connect(self._ws_url, ping_interval=None) as connection:
            await connection.send(json.dumps(payload))
            while True:
                raw = await asyncio.wait_for(connection.recv(), timeout=self._timeout)
                response = json.loads(raw)
                if response.get("id") != request_id:
                    continue

                envelope = response.get("payload")
                if isinstance(envelope, str):
                    envelope = json.loads(envelope)

                status = (envelope or {}).get("status", "success")
                if status == "success":
                    return (envelope or {}).get("payload")
                raise RemoteInvocationError(command, (envelope or {}).get("payload"))

    async def fetch_status(self) -> Dict[str, Any]:
        result = await self.invoke("get_remote_ui_status")
        return result or {}
