"""
One-time (re-runnable) loader that populates the ecommerce.db from the
scraped Amazon dataset (data.csv). Safe to re-run: it wipes and recreates
the products/categories/reviews tables each time, so it's meant for dev
seeding, not incremental updates.

Usage (from the backend/ directory, with data.csv also in backend/):
    python scripts/load_data.py
"""
import json
import os
import re
import sys
from pathlib import Path

import pandas as pd
from dateutil import parser as date_parser

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import models
from database import Base, SessionLocal, engine

CSV_PATH = Path(__file__).resolve().parents[1] / "data.csv"
MIN_CATEGORY_SIZE = 10

# The scraped dataset is mostly USD (a few GBP/INR rows). The app shows
# prices in Indian rupees, so everything is converted to INR at load time.
# Rates are approximate; override with env vars, e.g. USD_TO_INR=90
INR_RATES = {
    "USD": float(os.getenv("USD_TO_INR", "88")),
    "GBP": float(os.getenv("GBP_TO_INR", "115")),
    "INR": 1.0,
}


def clean_price(value):
    """Prices in this dataset show up as quoted strings, scientific
    notation strings, or the literal string 'null'. Extract the first
    real number, or None."""
    if value is None:
        return None
    text = str(value).strip().strip('"')
    if text.lower() == "null" or text == "":
        return None
    match = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", text)
    if not match:
        return None
    try:
        return round(float(match.group()), 2)
    except ValueError:
        return None


def clean_int(value):
    if value is None:
        return None
    text = str(value).strip().strip('"')
    if text.lower() == "null" or text == "" or text.lower() == "nan":
        return None
    match = re.search(r"\d+", text)
    return int(match.group()) if match else None


def clean_date(value):
    if value is None:
        return None
    text = str(value).strip().strip('"')
    if text.lower() == "null" or text == "" or text.lower() == "nan":
        return None
    try:
        return date_parser.parse(text, fuzzy=True)
    except (ValueError, OverflowError):
        return None


def stated_discount_magnitude(value):
    """The CSV has its own 'discount' text column (e.g. '-25%' or
    '₹363₹363 (25%)'). Return the percentage magnitude, or None."""
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"\(?\s*-?(\d+(?:\.\d+)?)\s*%", text)
    return float(match.group(1)) if match else None


def top_category(raw):
    try:
        arr = json.loads(str(raw).replace('""', '"'))
        if isinstance(arr, list) and arr:
            return str(arr[0]).strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return "Uncategorized"


def clean_text(value):
    if value is None:
        return None
    text = str(value).strip().strip('"')
    if text.lower() == "null" or text == "" or text.lower() == "nan":
        return None
    return text


def main():
    if not CSV_PATH.exists():
        raise SystemExit(
            f"Couldn't find {CSV_PATH}. Copy data.csv into backend/ first."
        )

    df = pd.read_csv(CSV_PATH)
    print(f"Loaded {len(df)} rows from {CSV_PATH.name}")

    # Categories with fewer than MIN_CATEGORY_SIZE products (e.g. "Women",
    # "Men", "Kitchen & Dining" with 1 item each) are grouped as "Other".
    df["_top_category"] = df["categories"].apply(top_category)
    counts = df["_top_category"].value_counts()
    small = set(counts[counts < MIN_CATEGORY_SIZE].index)

    # Fresh schema each run so re-running this script is safe.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    category_cache: dict[str, models.Category] = {}

    def get_or_create_category(name: str) -> models.Category:
        if name in category_cache:
            return category_cache[name]
        category = models.Category(name=name)
        db.add(category)
        db.flush()  # assigns category.id without a full commit
        category_cache[name] = category
        return category

    loaded, skipped, unreliable_discounts = 0, 0, 0

    for _, row in df.iterrows():
        title = clean_text(row.get("title"))
        if not title:
            skipped += 1
            continue

        final_price = clean_price(row.get("final_price"))
        initial_price = clean_price(row.get("initial_price"))
        if final_price is None:
            final_price = clean_price(row.get("initial_price"))
        if final_price is None:
            skipped += 1
            continue

        currency = (clean_text(row.get("currency")) or "USD").upper()
        rate = INR_RATES.get(currency, INR_RATES["USD"])
        final_price = round(final_price * rate, 2)
        if initial_price is not None:
            initial_price = round(initial_price * rate, 2)

        discount_pct = None
        if initial_price and initial_price > 0 and final_price is not None:
            discount_pct = round(
                (final_price - initial_price) / initial_price * 100, 2
            )

        # Some scraped rows have corrupted price columns (e.g. list price
        # 1595 but final price 118 while the dataset's own discount says
        # -25%). If the computed discount disagrees with the stated one, or
        # is an implausible -75% or worse with nothing to back it up, drop
        # the list price/discount instead of showing a fake "deal".
        stated = stated_discount_magnitude(row.get("discount"))
        if discount_pct is not None:
            mismatch = stated is not None and abs(abs(discount_pct) - stated) > 10
            implausible = stated is None and discount_pct <= -75
            if mismatch or implausible:
                unreliable_discounts += 1
                initial_price = None
                discount_pct = None

        cat_name = row["_top_category"]
        if cat_name in small:
            cat_name = "Other"
        category = get_or_create_category(cat_name)

        product = models.Product(
            title=title,
            description=clean_text(row.get("description")),
            price=final_price,
            brand=clean_text(row.get("brand")),
            category_id=category.id,
            initial_price=initial_price,
            discount_pct=discount_pct,
            rating=clean_price(row.get("rating")),
            reviews_count=clean_int(row.get("reviews_count")),
            image=clean_text(row.get("image_url")),
            url=clean_text(row.get("url")),
            bought_past_month=clean_int(row.get("bought_past_month")),
            bs_rank=clean_int(row.get("bs_rank")),
            number_of_sellers=clean_int(row.get("number_of_sellers")),
            date_first_available=clean_date(row.get("date_first_available")),
        )
        db.add(product)
        db.flush()

        top_review = clean_text(row.get("top_review"))
        rating_float = clean_price(row.get("rating"))
        rating_int = round(rating_float) if rating_float else 5
        if top_review or rating_float:
            db.add(
                models.Review(
                    product_id=product.id,
                    rating=rating_int,
                    comment=top_review,
                )
            )

        loaded += 1

    db.commit()
    db.close()

    print(f"Loaded {loaded} products across {len(category_cache)} categories")
    if unreliable_discounts:
        print(f"Ignored {unreliable_discounts} corrupted list prices/discounts")
    if skipped:
        print(f"Skipped {skipped} rows with no usable title/price")


if __name__ == "__main__":
    main()

    