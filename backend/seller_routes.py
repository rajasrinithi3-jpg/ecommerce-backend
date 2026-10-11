
import os
import uuid
from pathlib import Path

from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

import models
from auth import require_role
from database import get_db

router = APIRouter(tags=["seller"])


# Request validation
class SellerProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=250)
    description: str | None = None
    price: float = Field(gt=0, allow_inf_nan=False)
    brand: str | None = Field(default=None, max_length=150)
    category_id: int = Field(gt=0)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Product title cannot be empty")
        return value


class SellerProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=250)
    description: str | None = None
    price: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    brand: str | None = Field(default=None, max_length=150)
    category_id: int | None = Field(default=None, gt=0)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Product title cannot be empty")
        return value


def get_owned_product(
    product_id: int,
    seller_uid: str,
    db: Session,
) -> models.Product:
    product = (
        db.query(models.Product)
        .filter(
            models.Product.id == product_id,
            models.Product.seller_id == seller_uid,
        )
        .first()
    )

    if product is None:
        # Don't reveal whether another seller owns this product.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    return product


def validate_category(category_id: int, db: Session) -> None:
    category = (
        db.query(models.Category)
        .filter(models.Category.id == category_id)
        .first()
    )

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category does not exist",
        )


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).order_by(models.Category.name).all()


# List this seller's products
@router.get("/seller/products")
def get_seller_products(
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Product)
        .filter(models.Product.seller_id == user.uid)
        .order_by(models.Product.id.desc())
        .all()
    )


# Add a product
@router.post("/seller/products", status_code=status.HTTP_201_CREATED)
def create_seller_product(
    payload: SellerProductCreate,
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    validate_category(payload.category_id, db)

    product = models.Product(
        title=payload.title,
        description=payload.description,
        price=payload.price,
        brand=payload.brand,
        category_id=payload.category_id,
        seller_id=user.uid,
    )

    db.add(product)
    db.commit()
    db.refresh(product)
    return product


# Edit a product
@router.put("/seller/products/{product_id}")
def update_seller_product(
    product_id: int,
    payload: SellerProductUpdate,
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    product = get_owned_product(product_id, user.uid, db)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No product fields supplied",
        )

    if "category_id" in updates and updates["category_id"] is not None:
        validate_category(updates["category_id"], db)

    for field, value in updates.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


# Delete a product
@router.delete("/seller/products/{product_id}")
def delete_seller_product(
    product_id: int,
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    product = get_owned_product(product_id, user.uid, db)

    try:
        # Remove associated reviews before deleting the product.
        db.query(models.Review).filter(
            models.Review.product_id == product.id
        ).delete(synchronize_session=False)

        db.delete(product)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete product",
        )

    return {"message": "Product deleted successfully", "id": product_id}

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/seller/products/{product_id}/image")
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    product = get_owned_product(product_id, user.uid, db)

    extension = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, and WebP images are allowed",
        )

    content = await file.read(MAX_IMAGE_SIZE + 1)

    if not content:
        raise HTTPException(status_code=400, detail="Image file is empty")

    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must be 5 MB or smaller",
        )

    # Check file signatures instead of trusting only the browser MIME type.
    valid_signature = (
        (extension == ".jpg" and content.startswith(b"\xff\xd8\xff"))
        or (
            extension == ".png"
            and content.startswith(b"\x89PNG\r\n\x1a\n")
        )
        or (
            extension == ".webp"
            and content.startswith(b"RIFF")
            and content[8:12] == b"WEBP"
        )
    )

    if not valid_signature:
        raise HTTPException(status_code=400, detail="Invalid image file")

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename

    try:
        destination.write_bytes(content)
        product.image = f"/uploads/{filename}"
        db.commit()
        db.refresh(product)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Could not save product image",
        )
    finally:
        await file.close()

    return {
        "message": "Product image uploaded successfully",
        "image": product.image,
        "product_id": product.id,
    }
