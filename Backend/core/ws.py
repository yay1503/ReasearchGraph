import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket


class WorkspaceConnectionManager:
    """Manages per-workspace WebSocket connections for live agent cursors and updates."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, workspace_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[workspace_id].add(websocket)

    def disconnect(self, workspace_id: str, websocket: WebSocket) -> None:
        room = self._rooms.get(workspace_id)
        if room:
            room.discard(websocket)
            if not room:
                self._rooms.pop(workspace_id, None)

    async def broadcast(self, workspace_id: str, payload: dict) -> None:
        room = list(self._rooms.get(workspace_id, ()))
        if not room:
            return
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in room:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(workspace_id, ws)

    def broadcast_soon(self, workspace_id: str, payload: dict) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(workspace_id, payload))
        except RuntimeError:
            pass


ws_manager = WorkspaceConnectionManager()
