
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    Text,
    DateTime,
)
from sqlalchemy.orm import relationship

from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    brand = Column(String, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"))

    # Analytics fields
    initial_price = Column(Float, nullable=True)
    discount_pct = Column(Float, nullable=True)
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, nullable=True)
    image = Column(String, nullable=True)
    url = Column(String, nullable=True)
    bought_past_month = Column(Integer, nullable=True)
    bs_rank = Column(Integer, nullable=True)
    number_of_sellers = Column(Integer, nullable=True)
    date_first_available = Column(DateTime, nullable=True)

    seller_id = Column(
        String,
        ForeignKey("users.uid"),
        nullable=True,
        index=True,
    )

    category = relationship("Category", back_populates="products")
    reviews = relationship("Review", back_populates="product")
    seller = relationship("User", back_populates="products")


class User(Base):
    __tablename__ = "users"

    uid = Column(String, primary_key=True)
    email = Column(String, nullable=True)
    role = Column(String, nullable=False)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    products = relationship("Product", back_populates="seller")
    orders = relationship("Order", back_populates="user")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)

    product = relationship("Product", back_populates="reviews")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        String,
        ForeignKey("users.uid"),
        nullable=False,
        index=True,
    )

    customer_name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    shipping_address = Column(Text, nullable=False)

    total_amount = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="Pending")
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    user = relationship("User", back_populates="orders")
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(
        Integer,
        ForeignKey("orders.id"),
        nullable=False,
        index=True,
    )

    # Keep order history if a product is deleted later.
    product_id = Column(
        Integer,
        ForeignKey("products.id"),
        nullable=True,
    )

    product_title = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
