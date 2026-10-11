from datetime import datetime
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

import models
from auth import require_role
from database import get_db

router = APIRouter()


def _category_names(db: Session) -> dict[int, str]:
    return {
        category.id: category.name
        for category in db.query(models.Category).all()
    }


def _product_rows(db: Session, category_id: int | None = None):
    query = db.query(models.Product)
    if category_id is not None:
        query = query.filter(models.Product.category_id == category_id)
    return query.order_by(models.Product.id.desc()).all()


def _discount(product: models.Product) -> float | None:
    return product.discount_pct


def _deal_product(product: models.Product) -> dict:
    return {
        "id": product.id,
        "title": product.title,
        "brand": product.brand,
        "price": product.price,
        "initial_price": product.initial_price,
        "discount_pct": _discount(product),
        "rating": product.rating,
        "reviews_count": product.reviews_count,
        "bought_past_month": product.bought_past_month,
    }


@router.get("/products")
def get_products(db: Session = Depends(get_db)):
    return _product_rows(db)


@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)

    @field_validator("comment")
    @classmethod
    def validate_comment(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Review comment cannot be empty")
        return value


@router.get("/products/{product_id}/reviews")
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    exists = db.query(models.Product.id).filter(
        models.Product.id == product_id
    ).first()
    if exists is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return (
        db.query(models.Review)
        .filter(models.Review.product_id == product_id)
        .order_by(models.Review.id.desc())
        .all()
    )


@router.post(
    "/products/{product_id}/reviews",
    status_code=status.HTTP_201_CREATED,
)
def add_product_review(
    product_id: int,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
):
    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    review = models.Review(
        product_id=product_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.get("/products/{product_id}/recommendations")
def get_product_recommendations(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    peers = (
        db.query(models.Product)
        .filter(
            models.Product.category_id == product.category_id,
            models.Product.id != product_id,
        )
        .limit(5)
        .all()
    )
    names = _category_names(db)
    return [
        {
            "title": peer.title,
            "brand": peer.brand,
            "categories": names.get(peer.category_id),
            "similarity_score": 0.0,
        }
        for peer in peers
    ]


@router.get("/products/{product_id}/market-insight")
def get_market_insight(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    discount = _discount(product)
    if discount is None:
        recommendation, reason = "NO_DATA", "No reliable list-price data is available."
    elif discount > 0:
        recommendation, reason = "PRICE_RISING", "The current price is above its listed price."
    elif discount <= -25:
        recommendation, reason = "BUY_NOW", "The product is discounted by at least 25%."
    elif discount <= -10:
        recommendation, reason = "GOOD_DEAL", "The product has a moderate discount."
    else:
        recommendation, reason = "WAIT", "The current discount is small or unavailable."

    peers = (
        db.query(models.Product)
        .filter(
            models.Product.category_id == product.category_id,
            models.Product.id != product_id,
        )
        .all()
    )
    peers.sort(key=lambda peer: abs(peer.price - product.price))
    competitors = [
        {
            "id": peer.id,
            "title": peer.title,
            "brand": peer.brand,
            "price": peer.price,
            "rating": peer.rating,
            "discount_pct": peer.discount_pct,
            "price_diff_pct": (
                round((peer.price - product.price) / product.price * 100, 2)
                if product.price
                else None
            ),
            "image": peer.image,
        }
        for peer in peers[:5]
    ]
    age_days = (
        (datetime.utcnow() - product.date_first_available.replace(tzinfo=None)).days
        if product.date_first_available
        else None
    )
    return {
        "product_id": product.id,
        "profit_loss": {
            "current_price": product.price,
            "initial_price": product.initial_price,
            "discount_pct": discount,
            "listing_age_days": age_days,
        },
        "buy_or_wait": {
            "recommendation": recommendation,
            "reason": reason,
        },
        "competitors": competitors,
    }


@router.get("/api/analytics/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    products = _product_rows(db)
    names = _category_names(db)
    grouped: dict[int | None, list[models.Product]] = {}
    for product in products:
        grouped.setdefault(product.category_id, []).append(product)

    category_breakdown = []
    for category_id, rows in grouped.items():
        ratings = [row.rating for row in rows if row.rating is not None]
        category_breakdown.append(
            {
                "category": names.get(category_id, "Uncategorized"),
                "product_count": len(rows),
                "avg_price": round(sum(row.price for row in rows) / len(rows), 2),
                "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            }
        )
    discounts = [p.discount_pct for p in products if p.discount_pct is not None]
    ratings = [p.rating for p in products if p.rating is not None]
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "total_products": len(products),
        "total_categories": len(names),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "average_discount_pct": round(sum(discounts) / len(discounts), 2) if discounts else None,
        "category_breakdown": sorted(
            category_breakdown,
            key=lambda item: item["product_count"],
            reverse=True,
        ),
        "top_discounts": [
            {
                "id": p.id,
                "title": p.title,
                "brand": p.brand,
                "price": p.price,
                "discount_pct": p.discount_pct,
            }
            for p in sorted(
                (p for p in products if p.discount_pct is not None),
                key=lambda p: p.discount_pct,
            )[:10]
        ],
        "trending": [
            {
                "id": p.id,
                "title": p.title,
                "brand": p.brand,
                "bought_past_month": p.bought_past_month or 0,
            }
            for p in sorted(
                products,
                key=lambda p: p.bought_past_month or 0,
                reverse=True,
            )[:10]
        ],
    }


@router.get("/analytics/buyer")
def get_buyer_dashboard(
    _user: models.User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
):
    products = _product_rows(db)
    with_discount = [p for p in products if p.discount_pct is not None]
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "best_deals": [
            _deal_product(p)
            for p in sorted(with_discount, key=lambda p: p.discount_pct)[:10]
        ],
        "wait_list": [
            _deal_product(p)
            for p in sorted(
                products,
                key=lambda p: (
                    p.discount_pct if p.discount_pct is not None else 0,
                    p.rating or 0,
                ),
            )[:10]
        ],
        "top_rated": [
            _deal_product(p)
            for p in sorted(
                (p for p in products if p.rating is not None),
                key=lambda p: (p.rating, p.reviews_count or 0),
                reverse=True,
            )[:10]
        ],
        "trending": [
            _deal_product(p)
            for p in sorted(
                products,
                key=lambda p: p.bought_past_month or 0,
                reverse=True,
            )[:10]
        ],
    }


@router.get("/analytics/seller")
def get_seller_dashboard(
    category_id: int | None = Query(default=None, gt=0),
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    market_products = _product_rows(db, category_id)
    products = [p for p in market_products if p.seller_id == user.uid]
    names = _category_names(db)
    prices = [p.price for p in products]
    discounts = [p.discount_pct for p in products if p.discount_pct is not None]
    ratings = [p.rating for p in products if p.rating is not None]
    seller_counts = [p.number_of_sellers for p in products if p.number_of_sellers is not None]

    market_by_category: dict[int | None, list[models.Product]] = {}
    for product in market_products:
        market_by_category.setdefault(product.category_id, []).append(product)

    opportunities = []
    for product in products:
        category_products = market_by_category.get(product.category_id, [])
        category_prices = [p.price for p in category_products]
        category_median = median(category_prices)
        difference = round((product.price - category_median) / category_median * 100, 2) if category_median else 0
        demand = product.bought_past_month or 0
        if difference <= -10 and demand > 0:
            signal, reason = "RAISE_PRICE", "Priced below the category median with reported demand."
        elif demand > 0 and (product.rating or 0) >= 4:
            signal, reason = "SELL_NOW", "Strong demand or rating supports the current listing."
        elif difference >= 10 or demand == 0:
            signal, reason = "REDUCE_PRICE", "Price is above the category median or demand is low."
        else:
            continue
        opportunities.append(
            {
                "id": product.id,
                "title": product.title,
                "category": names.get(product.category_id),
                "price": product.price,
                "price_vs_category_median_pct": difference,
                "bought_past_month": product.bought_past_month,
                "rating": product.rating,
                "signal": signal,
                "reason": reason,
            }
        )

    category_rows = []
    for cid, rows in market_by_category.items():
        count_values = [p.number_of_sellers for p in rows if p.number_of_sellers is not None]
        discount_values = [p.discount_pct for p in rows if p.discount_pct is not None]
        category_rows.append(
            {
                "category_id": cid,
                "category": names.get(cid, "Uncategorized"),
                "product_count": len(rows),
                "avg_sellers_per_product": round(sum(count_values) / len(count_values), 2) if count_values else None,
                "avg_discount_pct": round(sum(discount_values) / len(discount_values), 2) if discount_values else None,
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "scope": names.get(category_id, "Your listings") if category_id else "Your listings",
        "kpis": {
            "product_count": len(products),
            "avg_price": round(sum(prices) / len(prices), 2) if prices else None,
            "median_price": median(prices) if prices else None,
            "avg_discount_pct": round(sum(discounts) / len(discounts), 2) if discounts else None,
            "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "avg_sellers_per_product": round(sum(seller_counts) / len(seller_counts), 2) if seller_counts else None,
        },
        "pricing_opportunities": sorted(
            opportunities,
            key=lambda row: abs(row["price_vs_category_median_pct"]),
            reverse=True,
        )[:10],
        "margin_pressure": [
            {
                "id": p.id,
                "title": p.title,
                "price": p.price,
                "initial_price": p.initial_price,
                "discount_pct": p.discount_pct,
            }
            for p in sorted(
                (p for p in products if p.discount_pct is not None),
                key=lambda p: p.discount_pct,
            )[:10]
        ],
        "demand_snapshot": [
            {
                "id": p.id,
                "title": p.title,
                "bought_past_month": p.bought_past_month,
                "estimated_weekly_units": round((p.bought_past_month or 0) / 4.3),
            }
            for p in sorted(
                (p for p in products if p.bought_past_month is not None),
                key=lambda p: p.bought_past_month or 0,
                reverse=True,
            )[:10]
        ],
        "competition": sorted(
            category_rows,
            key=lambda row: row["avg_sellers_per_product"] or 0,
            reverse=True,
        )[:10],
    }
