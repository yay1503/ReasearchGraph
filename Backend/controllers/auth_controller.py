import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
import psycopg2

from core.db import get_db, hash_password, verify_password
from models.schemas import LoginRequest, SignupRequest

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7


def _get_jwt_secret() -> str:
    explicit = (os.getenv("JWT_SECRET") or "").strip()
    if explicit:
        return explicit
    # Derive a deterministic secret across uvicorn --reload restarts when JWT_SECRET is unset
    seed = os.getenv("DATABASE_URL") or "researchgraph-local-dev-jwt-secret"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def _parse_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


def _extract_bearer_token(authorization: str | None = Header(default=None)) -> str:
    token = _parse_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token


def _decode_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _lookup_user_by_token(token: str, db) -> dict | None:
    payload = _decode_jwt(token)
    if payload is not None:
        user_id = payload.get("sub")
        if not user_id:
            return None
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.name, u.email, s.token AS session_token, s.expires_at
                FROM users u
                LEFT JOIN sessions s ON s.token = %s AND s.user_id = u.id
                WHERE u.id = %s
                """,
                (token, user_id),
            )
            row = cur.fetchone()
        if row is None or row["session_token"] is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "exp": payload.get("exp"),
        }

    # Backward-compatible lookup for legacy opaque session tokens
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.name, u.email
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = %s AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
            """,
            (token,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def get_current_user(
    token: str = Depends(_extract_bearer_token),
    db=Depends(get_db),
) -> dict:
    user = _lookup_user_by_token(token, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def get_optional_user(
    authorization: str | None = Header(default=None),
    db=Depends(get_db),
) -> dict | None:
    token = _parse_bearer_token(authorization)
    if not token:
        return None
    return _lookup_user_by_token(token, db)


def _create_session(user_id: str, name: str, email: str, db) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=JWT_EXPIRY_DAYS)
    payload = {
        "sub": user_id,
        "name": name,
        "email": email,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, _get_jwt_secret(), algorithm=JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode("utf-8")

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)",
            (token, user_id, expires_at.replace(tzinfo=None)),
        )
    return token, expires_at.isoformat()


def signup_user(body: SignupRequest, db) -> dict:
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
        token, expires_at = _create_session(user_id, name, email, db)
        db.commit()
    except psycopg2.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    return {
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": {"id": user_id, "name": name, "email": email},
    }


def login_user(body: LoginRequest, db) -> dict:
    email = body.email.strip().lower()
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = %s",
            (email,),
        )
        user = cur.fetchone()

    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token, expires_at = _create_session(user["id"], user["name"], user["email"], db)
    db.commit()
    return {
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }


def demo_login_user(db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, email FROM users WHERE email = %s",
            ("demo@researchgraph.ai",),
        )
        user = cur.fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="Demo account not found")

    token, expires_at = _create_session(user["id"], user["name"], user["email"], db)
    db.commit()
    return {
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }


def logout_user(token: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
    db.commit()
    return {"message": "Logged out"}
