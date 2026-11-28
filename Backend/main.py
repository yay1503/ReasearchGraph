from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from core.db import init_db
from core.ws import ws_manager
from routers.sandbox_routes import router as sandbox_router
from routes.agent_routes import router as agent_router
from routes.auth_routes import router as auth_router
from routes.graph_routes import router as graph_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ResearchGraph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(graph_router)
app.include_router(agent_router)
app.include_router(sandbox_router)


@app.websocket("/ws/{workspace_id}")
async def workspace_ws(websocket: WebSocket, workspace_id: str):
    await ws_manager.connect(workspace_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(workspace_id, websocket)
