from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from auth import FirebaseIdentity, get_current_user
from database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    role: Literal["buyer", "seller"]


def user_record(user: models.User) -> dict:
    return {
        "uid": user.uid,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at,
    }


@router.post("/register")
def register(
    payload: RegisterRequest,
    identity: FirebaseIdentity = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.uid == identity["uid"]).first()
    if user is None:
        user = models.User(
            uid=identity["uid"],
            email=identity.get("email"),
            role=payload.role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user_record(user)


@router.get("/me")
def me(
    identity: FirebaseIdentity = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.uid == identity["uid"]).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not registered. Register an account role first.",
        )
    return {"uid": user.uid, "email": user.email, "role": user.role}