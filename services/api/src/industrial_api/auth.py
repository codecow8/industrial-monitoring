import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.requests import HTTPConnection
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .database import get_session
from .models import AuthSession, AuthUser, LoginRate

COOKIE_NAME = "industrial_session"
SESSION_SECONDS = 8 * 60 * 60
router = APIRouter(prefix="/api/auth", tags=["authentication"])


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    _, salt, expected = encoded.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(digest, expected)


# Equal-cost password verification for unknown accounts.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def allowed_origins() -> list[str]:
    local = [f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 4173, 4174)]
    return os.getenv("AUTH_ALLOWED_ORIGINS", ",".join(local)).split(",")


def check_origin(request: HTTPConnection) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in allowed_origins():
        raise HTTPException(403, "不允许此来源访问登录会话。")
    if not origin and request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "不允许跨站访问登录会话。")


def valid_login(session: Session, hashed_token: str) -> AuthSession | None:
    # HTTP 与 WS 共用同一有效期和撤销判定，不凭旧连接继续授权。
    return session.scalar(select(AuthSession).join(AuthUser).where(
        AuthSession.token_hash == hashed_token, AuthSession.expires_at > datetime.now(UTC)
    ))


def current_user(request: Request, session: Session = Depends(get_session)) -> AuthUser:
    token = request.cookies.get(COOKIE_NAME, "")
    login_session = valid_login(session, token_hash(token)) if token else None
    user = session.get(AuthUser, login_session.user_id) if login_session else None
    if user is None:
        raise HTTPException(401, "登录已过期，请重新登录后继续。")
    return user


def describe_user(user: AuthUser, expires_at: datetime) -> dict:
    return {"id": user.id, "username": user.username, "expiresAt": expires_at.isoformat()}


def secure_cookie() -> bool:
    return os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


@router.post("/login", dependencies=[Depends(check_origin)])
def login(body: LoginInput, request: Request, response: Response, session: Session = Depends(get_session)) -> dict:
    now = datetime.now(UTC)
    # Atomic per-peer limit; do not trust arbitrary forwarded headers.
    peer = request.client.host if request.client else "unknown"
    session.execute(delete(LoginRate).where(LoginRate.reset_at <= now))
    statement = insert(LoginRate).values(client_key=peer, attempts=1, reset_at=now + timedelta(minutes=1))
    attempts = session.scalar(statement.on_conflict_do_update(
        index_elements=[LoginRate.client_key], set_={"attempts": LoginRate.attempts + 1}
    ).returning(LoginRate.attempts))
    session.commit()
    if attempts > 10:
        raise HTTPException(429, "登录尝试过于频繁，请一分钟后重试。", headers={"Retry-After": "60"})
    user = session.scalar(select(AuthUser).where(AuthUser.username == body.username.strip()))
    valid = verify_password(body.password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not valid or user is None:
        raise HTTPException(401, "账号或密码错误，请重新输入。")
    previous = request.cookies.get(COOKIE_NAME)
    if previous:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(previous)))
    session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=SESSION_SECONDS)
    session.add(AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=expires_at))
    session.commit()
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=secure_cookie(), samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return describe_user(user, expires_at)


@router.get("/me")
def me(request: Request, response: Response, user: AuthUser = Depends(current_user),
       session: Session = Depends(get_session)) -> dict:
    item = session.get(AuthSession, token_hash(request.cookies[COOKIE_NAME]))
    if item is None:
        raise HTTPException(401, "登录已过期，请重新登录后继续。")
    response.headers["Cache-Control"] = "no-store"
    return describe_user(user, item.expires_at)


@router.post("/logout", status_code=204, dependencies=[Depends(check_origin)])
def logout(request: Request, session: Session = Depends(get_session)) -> Response:
    session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(request.cookies.get(COOKIE_NAME, ""))))
    session.commit()
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    response.delete_cookie(COOKIE_NAME, path="/", secure=secure_cookie(), httponly=True, samesite="lax")
    return response
