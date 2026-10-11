
import os
import runpy
import statistics
from datetime import datetime
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator

import models
from database import (
    SessionLocal,
    engine,
    get_db,
    ensure_product_seller_id_column,
)
from auth import require_role
from auth_routes import router as auth_router
from seller_routes import router as seller_router
from order_routes import router as order_router
from catalog_routes import router as catalog_router
from chatbot import ChatbotService, ChatRateLimiter
from src.recommendation.recommender import Recommender


# ---------- Database setup ----------

# Import models and engine before creating tables.
models.Base.metadata.create_all(bind=engine)
ensure_product_seller_id_column()


def ensure_seeded_data() -> None:
    with SessionLocal() as db:
        product_count = (
            db.execute(text("SELECT COUNT(*) FROM products")).scalar_one() or 0
        )
        category_count = (
            db.execute(text("SELECT COUNT(*) FROM categories")).scalar_one() or 0
        )

    if product_count == 0 or category_count == 0:
        script_path = (
            Path(__file__).resolve().parent / "scripts" / "load_data.py"
        )
        if script_path.exists():
            runpy.run_path(str(script_path), run_name="__main__")


ensure_seeded_data()


# ---------- FastAPI application ----------

app = FastAPI(title="Ecommerce Backend API")

app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(seller_router)
app.include_router(order_router)


# ---------- Uploaded images ----------

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)


# ---------- CORS ----------

default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]

extra_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=default_origins + extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------- Services ----------

recommender = Recommender()


def _buy_or_wait(
    discount_pct: float | None,
    bought_past_month: int | None,
    listing_age_days: int | None,
) -> dict[str, str]:
    if discount_pct is None:
        return {
            "recommendation": "NO_DATA",
            "reason": "No reliable list-price data is available.",
        }
    if discount_pct > 0:
        return {
            "recommendation": "PRICE_RISING",
            "reason": "The current price is above its listed price.",
        }
    if discount_pct <= -25:
        return {
            "recommendation": "BUY_NOW",
            "reason": "The product is discounted by at least 25%.",
        }
    if discount_pct <= -10:
        return {
            "recommendation": "GOOD_DEAL",
            "reason": "The product has a moderate discount.",
        }
    if bought_past_month and bought_past_month > 0 and listing_age_days and listing_age_days > 30:
        return {
            "recommendation": "WAIT",
            "reason": "The discount is small; compare prices again later.",
        }
    return {
        "recommendation": "WAIT",
        "reason": "The current discount is small or unavailable.",
    }


chatbot_service = ChatbotService(_buy_or_wait)
chat_rate_limiter = ChatRateLimiter()
with SessionLocal() as db:
    chatbot_service.build_index(db)


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=20)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty")
        return value


@app.post("/chat")
async def post_chat(payload: ChatRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not chat_rate_limiter.allow(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before sending another message.",
        )

    history = [item.model_dump() for item in payload.history[-6:]]
    products, context = chatbot_service.retrieve(payload.message, history=history)
    reply, mode = await chatbot_service.reply(
        payload.message,
        history,
        products,
        context,
    )
    return {"reply": reply, "products": products, "mode": mode}
