from pydantic import BaseModel


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class WorkspaceCreate(BaseModel):
    name: str
    description: str = ""


class NodeCreate(BaseModel):
    workspace_id: str
    type: str
    title: str
    url: str = ""
    content: str = ""
    metadata_json: str = "{}"
    tags_json: str = "[]"
    group_id: str | None = None
    pos_x: float = 0.0
    pos_y: float = 0.0


class NodeUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    content: str | None = None
    metadata_json: str | None = None
    tags_json: str | None = None
    group_id: str | None = None


class NodePositionUpdate(BaseModel):
    pos_x: float
    pos_y: float


class EdgeCreate(BaseModel):
    workspace_id: str
    source_id: str
    target_id: str
    label: str = ""


class LogDecision(BaseModel):
    decision: str
    feedback: str = ""


class LLMTestRequest(BaseModel):
    provider: str = "ollama"
    model: str = ""
    api_key: str = ""


class WhatIfRequest(BaseModel):
    question: str


class FetchUrlRequest(BaseModel):
    url: str


class HarnessRequest(BaseModel):
    goal: str
    auto_approve: bool = False


class AgentCreateRequest(BaseModel):
    name: str
    role: str


class AgentRateRequest(BaseModel):
    delta: float = 0.2


class ControllerDispatchRequest(BaseModel):
    goal: str
    auto_approve: bool = False
