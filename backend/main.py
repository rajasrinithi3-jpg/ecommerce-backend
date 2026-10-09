import statistics
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

from chatbot import ChatbotService, ChatRateLimiter
from src.recommendation.recommender import Recommender
import models
from database import SessionLocal, engine, get_db

recommender = Recommender()

# Create database tables automatically
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Ecommerce Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=1000)

    @field_validator("comment")
    @classmethod
    def non_empty_comment(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Review comment cannot be empty")
        return value

class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    brand: Optional[str] = None
    category_id: int

class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: List[ChatHistoryMessage] = Field(default_factory=list)

    @field_validator("message")
    @classmethod
    def non_whitespace_message(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty")
        return value

    @field_validator("history")
    @classmethod
    def keep_last_six_messages(cls, value):
        return value[-6:]


# --- API Endpoints ---

# 1. Root Welcome Endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Ecommerce Backend API"}

# 2. Get All Products (Database)
@app.get("/products")
def get_products(db: Session = Depends(get_db)):
    products = db.query(models.Product).all()
    return products

# 3. Get Single Product Detail by ID
@app.get("/products/{id}")
def get_product(id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product

# 4. Create Product (Database)
@app.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    new_product = models.Product(
        title=product.title,
        description=product.description,
        price=product.price,
        brand=product.brand,
        category_id=product.category_id
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product

# 5. Get Product Reviews by Product ID
@app.get("/products/{id}/reviews")
def get_product_reviews(id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product.reviews

@app.post("/products/{id}/reviews", status_code=status.HTTP_201_CREATED)
def create_product_review(id: int, review: ReviewCreate, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    new_review = models.Review(
        product_id=product.id,
        rating=review.rating,
        comment=review.comment,
    )
    db.add(new_review)
    db.commit()
    db.refresh(new_review)
    return new_review

# 6. Get Categories (Database)
@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(models.Category).all()
    return categories

@app.get("/recommendations")
def get_recommendations_by_title(title: str):
    recommendations = recommender.recommend(title)
    if not recommendations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product title not found in recommendations dataset"
        )
    return recommendations

@app.get("/products/{id}/recommendations")
def get_recommendations(id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )
    recommendations = recommender.recommend(product.title)
    if not recommendations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recommendations found for this product"
        )
    return recommendations


# --- Market insight: profit/loss, buy-or-wait, competitors ---
#
# "Real-time" here means computed fresh from the current database on every
# request, not a live feed from Amazon — there's no live scraper behind
# this. The buy/wait call is a simple, explainable heuristic on the fields
# the dataset actually has (discount depth + listing age + demand signal),
# not a predictive model.

def _buy_or_wait(discount_pct, bought_past_month, listing_age_days):
    demand_note = ""
    if bought_past_month and bought_past_month >= 200:
        demand_note = f" Demand is high ({bought_past_month}+ bought in the past month)."

    if discount_pct is None:
        return {
            "recommendation": "NO_DATA",
            "reason": "No original list price on record for this product, so a discount can't be calculated yet."
                      + demand_note,
        }
    if discount_pct <= -25:
        return {
            "recommendation": "BUY_NOW",
            "reason": f"Price is down {abs(discount_pct):.0f}% from its list price — a deep discount and a strong buy signal."
                      + demand_note,
        }
    if discount_pct <= -10:
        return {
            "recommendation": "GOOD_DEAL",
            "reason": f"Price is down {abs(discount_pct):.0f}% from list — a solid deal if you need it now."
                      + demand_note,
        }
    if discount_pct < 0:
        return {
            "recommendation": "WAIT",
            "reason": f"Only a small discount right now ({abs(discount_pct):.0f}% off) — a deeper cut may come later, especially around sale seasons."
                      + demand_note,
        }
    if discount_pct == 0:
        return {
            "recommendation": "WAIT",
            "reason": "No discount currently applied — price is at its original list price." + demand_note,
        }
    return {
        "recommendation": "PRICE_RISING",
        "reason": f"Price is actually {discount_pct:.0f}% above its original listing — consider waiting or checking similar products."
                  + demand_note,
    }


chatbot_service = ChatbotService(_buy_or_wait)
chat_rate_limiter = ChatRateLimiter(limit=20, window_seconds=60)
_chat_index_db = SessionLocal()
try:
    chatbot_service.build_index(_chat_index_db)
finally:
    _chat_index_db.close()


@app.post("/chat")
async def chat(payload: ChatRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not chat_rate_limiter.allow(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You're sending messages too quickly. Please wait a minute and try again.",
        )

    history = [item.model_dump() for item in payload.history[-6:]]
    products, context = chatbot_service.retrieve(payload.message, history=history)
    reply, mode = await chatbot_service.reply(payload.message, history, products, context)
    return {
        "reply": reply,
        "products": [
            {
                "id": product["id"],
                "title": product["title"],
                "brand": product["brand"],
                "price": product["price"],
                "rating": product["rating"],
                "discount_pct": product["discount_pct"],
                "image": product["image"],
                "signal": product["signal"],
            }
            for product in products
        ],
        "mode": mode,
    }


@app.get("/products/{id}/market-insight")
def get_market_insight(id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    listing_age_days = None
    if product.date_first_available:
        listing_age_days = (datetime.utcnow() - product.date_first_available).days

    profit_loss = {
        "current_price": product.price,
        "initial_price": product.initial_price,
        "discount_pct": product.discount_pct,
        "listing_age_days": listing_age_days,
    }

    buy_or_wait = _buy_or_wait(
        product.discount_pct, product.bought_past_month, listing_age_days
    )

    # Competitors = similar/rival products in the same category, closest
    # in price to this one — that's what actually makes two listings
    # rivals for a buyer's decision, rather than just sharing a broad
    # category label (e.g. "Tools & Home Improvement" spans everything
    # from door handles to $300 filtration systems).
    same_category = (
        db.query(models.Product)
        .filter(
            models.Product.category_id == product.category_id,
            models.Product.id != product.id,
        )
        .all()
    )
    same_category.sort(key=lambda p: abs(p.price - product.price))
    competitors_query = same_category[:5]

    competitors = []
    for comp in competitors_query:
        price_diff_pct = (
            round((comp.price - product.price) / product.price * 100, 1)
            if product.price
            else None
        )
        competitors.append(
            {
                "id": comp.id,
                "title": comp.title,
                "brand": comp.brand,
                "price": comp.price,
                "rating": comp.rating,
                "discount_pct": comp.discount_pct,
                "price_diff_pct": price_diff_pct,
                "image": comp.image,
            }
        )

    return {
        "product_id": product.id,
        "profit_loss": profit_loss,
        "buy_or_wait": buy_or_wait,
        "competitors": competitors,
    }


@app.get("/analytics/overview")
@app.get("/api/analytics/summary")
def get_analytics_overview(db: Session = Depends(get_db)):
    products = db.query(models.Product).all()
    categories = db.query(models.Category).all()

    total_products = len(products)
    rated = [p for p in products if p.rating is not None]
    discounted = [p for p in products if p.discount_pct is not None]

    average_rating = round(sum(p.rating for p in rated) / len(rated), 2) if rated else None
    average_discount_pct = (
        round(sum(p.discount_pct for p in discounted) / len(discounted), 2)
        if discounted
        else None
    )

    category_breakdown = []
    for cat in categories:
        cat_products = [p for p in products if p.category_id == cat.id]
        if not cat_products:
            continue
        cat_rated = [p.rating for p in cat_products if p.rating is not None]
        category_breakdown.append(
            {
                "category": cat.name,
                "product_count": len(cat_products),
                "avg_price": round(sum(p.price for p in cat_products) / len(cat_products), 2),
                "avg_rating": round(sum(cat_rated) / len(cat_rated), 2) if cat_rated else None,
            }
        )
    category_breakdown.sort(key=lambda c: c["product_count"], reverse=True)

    top_discounts = sorted(
        discounted, key=lambda p: p.discount_pct
    )[:8]
    top_discounts = [
        {
            "id": p.id,
            "title": p.title,
            "brand": p.brand,
            "price": p.price,
            "discount_pct": p.discount_pct,
        }
        for p in top_discounts
    ]

    trending_pool = [p for p in products if p.bought_past_month]
    trending = sorted(trending_pool, key=lambda p: p.bought_past_month, reverse=True)[:8]
    trending = [
        {
            "id": p.id,
            "title": p.title,
            "brand": p.brand,
            "bought_past_month": p.bought_past_month,
        }
        for p in trending
    ]

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_products": total_products,
        "total_categories": len(categories),
        "average_rating": average_rating,
        "average_discount_pct": average_discount_pct,
        "category_breakdown": category_breakdown,
        "top_discounts": top_discounts,
        "trending": trending,
    }


# --- Buyer dashboard ---
@app.get("/analytics/buyer")
def get_buyer_dashboard(db: Session = Depends(get_db)):
    products = db.query(models.Product).all()

    def brief(p):
        return {
            "id": p.id,
            "title": p.title,
            "brand": p.brand,
            "price": p.price,
            "initial_price": p.initial_price,
            "discount_pct": p.discount_pct,
            "rating": p.rating,
            "reviews_count": p.reviews_count,
            "bought_past_month": p.bought_past_month,
        }

    # Same thresholds as the per-product buy/wait signal (>=25% off = BUY_NOW),
    # limited to well-rated products so "deals" aren't junk.
    best_deals = sorted(
        [p for p in products
         if p.discount_pct is not None and p.discount_pct <= -25
         and (p.rating or 0) >= 4.0],
        key=lambda p: p.discount_pct,
    )[:10]

    # Price is above the original list price: a reason to hold off.
    wait_list = sorted(
        [p for p in products if p.discount_pct is not None and p.discount_pct > 0],
        key=lambda p: p.discount_pct,
        reverse=True,
    )[:8]

    top_rated = sorted(
        [p for p in products if (p.rating or 0) >= 4.5 and p.reviews_count],
        key=lambda p: p.reviews_count,
        reverse=True,
    )[:8]

    trending = sorted(
        [p for p in products if p.bought_past_month],
        key=lambda p: p.bought_past_month,
        reverse=True,
    )[:8]

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "best_deals": [brief(p) for p in best_deals],
        "wait_list": [brief(p) for p in wait_list],
        "top_rated": [brief(p) for p in top_rated],
        "trending": [brief(p) for p in trending],
    }


# --- Seller dashboard ---
# The dataset has no seller ownership or cost data, so this is a market view:
# "how is this category priced, and where is there room to move?"
@app.get("/analytics/seller")
def get_seller_dashboard(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    all_products = db.query(models.Product).all()
    categories = {c.id: c.name for c in db.query(models.Category).all()}

    if category_id is not None and category_id not in categories:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    scope = [p for p in all_products if category_id is None or p.category_id == category_id]

    def avg(values):
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values), 2) if values else None

    # Median price per category, used to judge each product's positioning.
    median_by_cat = {}
    for cid in categories:
        prices = [p.price for p in all_products if p.category_id == cid]
        if prices:
            median_by_cat[cid] = statistics.median(prices)

    opportunities = []
    for p in scope:
        median = median_by_cat.get(p.category_id)
        if not median:
            continue
        vs_median = (p.price - median) / median * 100
        demand = p.bought_past_month or 0
        rating = p.rating or 0

        signal = reason = None
        if demand >= 100 and vs_median <= -15:
            signal = "RAISE_PRICE"
            reason = f"High demand ({demand}+ bought last month) and priced {abs(vs_median):.0f}% below the category median - there's room to raise the price."
        elif demand >= 500:
            signal = "SELL_NOW"
            reason = f"Very strong demand ({demand}+ bought last month) - keep stock up and push it now."
        elif vs_median >= 30 and p.rating is not None and p.rating < 4.2:
            # Only flag on a known weak rating: most rows have no demand
            # figure at all, so "no demand data" is not evidence of low demand.
            signal = "REDUCE_PRICE"
            reason = f"Priced {vs_median:.0f}% above the category median and rated only {p.rating} - a price cut could help it sell."

        if signal:
            opportunities.append({
                "id": p.id,
                "title": p.title,
                "category": categories.get(p.category_id),
                "price": p.price,
                "price_vs_category_median_pct": round(vs_median, 1),
                "bought_past_month": p.bought_past_month,
                "rating": p.rating,
                "signal": signal,
                "reason": reason,
                "_sort": max(demand, abs(vs_median)),
            })
    opportunities.sort(key=lambda o: o["_sort"], reverse=True)
    opportunities = opportunities[:10]
    for o in opportunities:
        o.pop("_sort")

    margin_pressure = sorted(
        [p for p in scope if p.discount_pct is not None],
        key=lambda p: p.discount_pct,
    )[:8]

    demand_snapshot = sorted(
        [p for p in scope if p.bought_past_month],
        key=lambda p: p.bought_past_month,
        reverse=True,
    )[:6]

    competition = []
    for cid, name in categories.items():
        cp = [p for p in all_products if p.category_id == cid]
        if not cp:
            continue
        competition.append({
            "category_id": cid,
            "category": name,
            "product_count": len(cp),
            "avg_sellers_per_product": avg([p.number_of_sellers for p in cp]),
            "avg_discount_pct": avg([p.discount_pct for p in cp]),
        })
    competition.sort(key=lambda c: c["product_count"], reverse=True)

    scope_prices = [p.price for p in scope]
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "scope": categories.get(category_id, "All categories"),
        "kpis": {
            "product_count": len(scope),
            "avg_price": avg(scope_prices),
            "median_price": round(statistics.median(scope_prices), 2) if scope_prices else None,
            "avg_discount_pct": avg([p.discount_pct for p in scope]),
            "avg_rating": avg([p.rating for p in scope]),
            "avg_sellers_per_product": avg([p.number_of_sellers for p in scope]),
        },
        "pricing_opportunities": opportunities,
        "margin_pressure": [
            {"id": p.id, "title": p.title, "price": p.price,
             "initial_price": p.initial_price, "discount_pct": p.discount_pct}
            for p in margin_pressure
        ],
        "demand_snapshot": [
            {
                "id": p.id,
                "title": p.title,
                "bought_past_month": p.bought_past_month,
                "estimated_weekly_units": round(p.bought_past_month / 4.3),
            }
            for p in demand_snapshot
        ],
        "competition": competition[:10],
    }