
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

import models
from auth import require_role
from database import get_db


router = APIRouter(tags=["orders"])


# ---------- Request schemas ----------

class OrderItemRequest(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


class OrderCreateRequest(BaseModel):
    customer_name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=7, max_length=20)
    shipping_address: str = Field(min_length=5, max_length=1000)
    items: list[OrderItemRequest] = Field(min_length=1, max_length=100)


# ---------- Response helper ----------

def serialize_order(order: models.Order) -> dict:
    return {
        "id": order.id,
        "customer_name": order.customer_name,
        "phone": order.phone,
        "shipping_address": order.shipping_address,
        "total_amount": order.total_amount,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
        "items": [
            {
                "product_id": item.product_id,
                "product_title": item.product_title,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": round(item.quantity * item.unit_price, 2),
            }
            for item in order.items
        ],
    }


# ---------- Place an order ----------

@router.post("/orders", status_code=201)
def create_order(
    payload: OrderCreateRequest,
    user: models.User = Depends(require_role("buyer", "customer")),
    db: Session = Depends(get_db),
):
    customer_name = payload.customer_name.strip()
    phone = payload.phone.strip()
    shipping_address = payload.shipping_address.strip()

    if not customer_name or not phone or not shipping_address:
        raise HTTPException(
            status_code=400,
            detail="Customer name, phone, and address are required.",
        )

    # Reject repeated product IDs to keep the order unambiguous.
    product_ids = [item.product_id for item in payload.items]

    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=400,
            detail="Each product should appear only once in the order.",
        )

    products = (
        db.query(models.Product)
        .filter(models.Product.id.in_(product_ids))
        .all()
    )
    products_by_id = {product.id: product for product in products}

    if len(products_by_id) != len(product_ids):
        raise HTTPException(
            status_code=400,
            detail="One or more products do not exist.",
        )

    # Calculate the total from trusted database prices.
    total = Decimal("0.00")
    order_items = []

    for requested_item in payload.items:
        product = products_by_id[requested_item.product_id]

        if not product.price or product.price <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Product {product.id} has an invalid price.",
            )

        unit_price = Decimal(str(product.price)).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        subtotal = unit_price * requested_item.quantity
        total += subtotal

        order_items.append(
            models.OrderItem(
                product_id=product.id,
                product_title=product.title,
                quantity=requested_item.quantity,
                unit_price=float(unit_price),
            )
        )

    total = total.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    order = models.Order(
        user_id=user.uid,
        customer_name=customer_name,
        phone=phone,
        shipping_address=shipping_address,
        total_amount=float(total),
        status="Pending",
        items=order_items,
    )

    try:
        db.add(order)
        db.commit()
        db.refresh(order)

        # Reload items for a predictable response.
        saved_order = (
            db.query(models.Order)
            .options(selectinload(models.Order.items))
            .filter(
                models.Order.id == order.id,
                models.Order.user_id == user.uid,
            )
            .first()
        )

        return serialize_order(saved_order)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not place the order. Please try again.",
        )


# ---------- Get the signed-in customer's orders ----------

@router.get("/orders/my-orders")
def get_my_orders(
    user: models.User = Depends(require_role("buyer", "customer")),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(models.Order)
        .options(selectinload(models.Order.items))
        .filter(models.Order.user_id == user.uid)
        .order_by(models.Order.created_at.desc())
        .all()
    )

    return [serialize_order(order) for order in orders]


# ---------- Get one of the customer's orders ----------

@router.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user: models.User = Depends(require_role("buyer", "customer")),
    db: Session = Depends(get_db),
):
    order = (
        db.query(models.Order)
        .options(selectinload(models.Order.items))
        .filter(
            models.Order.id == order_id,
            models.Order.user_id == user.uid,
        )
        .first()
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    return serialize_order(order)
