from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from controllers.auth_controller import get_current_user, get_optional_user
from controllers.graph_controller import (
    continue_shared_workspace,
    create_graph_edge,
    create_graph_node,
    create_new_workspace,
    create_workspace_share,
    delete_graph_edge,
    delete_graph_node,
    delete_user_workspace,
    export_workspace_markdown,
    get_shared_workspace,
    get_workspace_graph,
    get_workspace_timeline,
    invite_collaborator,
    join_shared_workspace,
    list_collaborators,
    list_user_workspaces,
    update_graph_node,
    update_graph_node_position,
)
from core.db import get_db
from models.schemas import (
    CollaboratorInviteRequest,
    EdgeCreate,
    NodeCreate,
    NodePositionUpdate,
    NodeUpdate,
    ShareCreateRequest,
    WorkspaceCreate,
)

router = APIRouter(tags=["graph"])


@router.get("/workspaces")
async def list_workspaces(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    return list_user_workspaces(current_user, db)


@router.post("/workspaces")
async def create_workspace(
    ws: WorkspaceCreate,
    current_user: dict | None = Depends(get_optional_user),
    db=Depends(get_db),
):
    return create_new_workspace(ws, current_user, db)


@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    return delete_user_workspace(workspace_id, current_user, db)


@router.get("/workspaces/{workspace_id}/graph")
async def get_graph(workspace_id: str, db=Depends(get_db)):
    return get_workspace_graph(workspace_id, db)


@router.post("/nodes")
async def create_node(node: NodeCreate, db=Depends(get_db)):
    return create_graph_node(node, db)


@router.patch("/nodes/{node_id}")
async def update_node(node_id: str, body: NodeUpdate, db=Depends(get_db)):
    return update_graph_node(node_id, body, db)


@router.patch("/nodes/{node_id}/position")
async def update_node_position(
    node_id: str,
    pos: NodePositionUpdate,
    db=Depends(get_db),
):
    return update_graph_node_position(node_id, pos, db)


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, db=Depends(get_db)):
    return delete_graph_node(node_id, db)


@router.post("/edges")
async def create_edge(edge: EdgeCreate, db=Depends(get_db)):
    return create_graph_edge(edge, db)


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, db=Depends(get_db)):
    return delete_graph_edge(edge_id, db)


@router.get("/workspaces/{workspace_id}/export", response_class=PlainTextResponse)
async def export_workspace(workspace_id: str, db=Depends(get_db)):
    return export_workspace_markdown(workspace_id, db)


@router.post("/workspaces/{workspace_id}/share")
async def share_workspace(
    workspace_id: str,
    body: ShareCreateRequest | None = None,
    current_user: dict | None = Depends(get_optional_user),
    db=Depends(get_db),
):
    return create_workspace_share(
        workspace_id,
        body.role if body else "snapshot",
        db,
        refresh=body.refresh if body else False,
        current_user=current_user,
    )


@router.get("/share/{share_token}")
async def read_shared_workspace(share_token: str, db=Depends(get_db)):
    return get_shared_workspace(share_token, db)


@router.post("/share/{share_token}/continue")
async def continue_share(
    share_token: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    return continue_shared_workspace(share_token, current_user, db)


@router.post("/share/{share_token}/join")
async def join_share(
    share_token: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    return join_shared_workspace(share_token, current_user, db)


@router.get("/workspaces/{workspace_id}/collaborators")
async def get_collaborators(workspace_id: str, db=Depends(get_db)):
    return list_collaborators(workspace_id, db)


@router.post("/workspaces/{workspace_id}/collaborators")
async def add_collaborator(
    workspace_id: str,
    body: CollaboratorInviteRequest,
    db=Depends(get_db),
):
    return invite_collaborator(workspace_id, body.email, body.role, db)


@router.get("/workspaces/{workspace_id}/timeline")
async def workspace_timeline(workspace_id: str, db=Depends(get_db)):
    return get_workspace_timeline(workspace_id, db)
