from fastapi import APIRouter, Depends

from controllers.auth_controller import (
    _extract_bearer_token,
    demo_login_user,
    get_current_user,
    login_user,
    logout_user,
    signup_user,
)
from core.db import get_db
from models.schemas import LoginRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup")
def signup(body: SignupRequest, db=Depends(get_db)):
    return signup_user(body, db)


@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    return login_user(body, db)


@router.post("/demo")
def demo_login(db=Depends(get_db)):
    return demo_login_user(db)


@router.post("/logout")
def logout(
    _user: dict = Depends(get_current_user),
    token: str = Depends(_extract_bearer_token),
    db=Depends(get_db),
):
    return logout_user(token, db)


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user
