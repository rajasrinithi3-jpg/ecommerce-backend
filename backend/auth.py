import os
from collections.abc import Callable
from typing import TypedDict

from fastapi import Depends, Header, HTTPException, status
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from sqlalchemy.orm import Session

import models
from database import get_db


class FirebaseIdentity(TypedDict):
    uid: str
    email: str | None


def get_token_verifier() -> Callable[[str], dict]:
    def verify(token: str) -> dict:
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        if not project_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Firebase authentication is not configured.",
            )
        return id_token.verify_firebase_token(
            token,
            Request(),
            audience=project_id,
        )

    return verify


def get_firebase_claims(
    authorization: str | None = Header(default=None),
    verify_token: Callable[[str], dict] = Depends(get_token_verifier),
) -> dict:
    parts = authorization.split() if authorization else []
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A Firebase ID token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = verify_token(parts[1])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Firebase ID token is invalid, expired, or for another project.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if not isinstance(claims, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Firebase ID token is invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


def get_current_user(
    claims: dict = Depends(get_firebase_claims),
) -> FirebaseIdentity:
    uid = claims.get("user_id") or claims.get("sub")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Firebase ID token does not contain a user ID.",
        )
    return {"uid": uid, "email": claims.get("email")}


def require_role(*roles: str):
    def role_dependency(
        identity: FirebaseIdentity = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> models.User:
        user = db.query(models.User).filter(models.User.uid == identity["uid"]).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not registered. Register an account role first.",
            )
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to access this resource with your role.",
            )
        return user

    return role_dependency