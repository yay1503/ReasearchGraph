import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
import psycopg2
from pydantic import BaseModel

from db import get_db, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def _extract_bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return parts[1].strip()


def get_current_user(
    token: str = Depends(_extract_bearer_token),
    db=Depends(get_db),
) -> dict:
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.name, u.email
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = %s
            """,
            (token,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def _create_session(user_id: str, db) -> str:
    token = secrets.token_urlsafe(32)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (token, user_id) VALUES (%s, %s)",
            (token, user_id),
        )
    return token


@router.post("/signup")
def signup(body: SignupRequest, db=Depends(get_db)):
    name = body.name.strip()
    email = body.email.strip().lower()
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")
    if len(body.password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )

    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone() is not None:
            raise HTTPException(status_code=409, detail="Email already registered")

    user_id = uuid.uuid4().hex
    pw_hash = hash_password(body.password)

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, name, email, pw_hash),
            )
        token = _create_session(user_id, db)
        db.commit()
    except psycopg2.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    return {
        "token": token,
        "user": {"id": user_id, "name": name, "email": email},
    }


@router.post("/login")
def login(body: LoginRequest, db=Depends(get_db)):
    email = body.email.strip().lower()
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = %s",
            (email,),
        )
        user = cur.fetchone()

    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_session(user["id"], db)
    db.commit()
    return {
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }


@router.post("/demo")
def demo_login(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email FROM users WHERE email = %s",
            ("demo@researchgraph.ai",),
        )
        user = cur.fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="Demo account not found")

    token = _create_session(user["id"], db)
    db.commit()
    return {
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }


@router.post("/logout")
def logout(
    _user: dict = Depends(get_current_user),
    token: str = Depends(_extract_bearer_token),
    db=Depends(get_db),
):
    with db.cursor() as cur:
        cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
    db.commit()
    return {"message": "Logged out"}


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user
