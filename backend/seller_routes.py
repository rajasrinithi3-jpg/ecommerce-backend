from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from auth import require_role
from database import get_db

router = APIRouter(tags=["seller"])


@router.get("/seller/products")
def get_seller_products(
    user: models.User = Depends(require_role("seller")),
    db: Session = Depends(get_db),
):
    return db.query(models.Product).filter(models.Product.seller_id == user.uid).all()