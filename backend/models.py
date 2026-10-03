from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, DateTime
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
    price = Column(Float, nullable=False)  # current/final price
    brand = Column(String, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"))

    # --- analytics fields (sourced from the scraped Amazon dataset) ---
    initial_price = Column(Float, nullable=True)       # pre-discount list price
    discount_pct = Column(Float, nullable=True)         # computed: (initial-final)/initial * 100
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, nullable=True)
    image = Column(String, nullable=True)
    url = Column(String, nullable=True)
    bought_past_month = Column(Integer, nullable=True)  # demand signal
    bs_rank = Column(Integer, nullable=True)            # best-sellers rank; lower = more popular
    number_of_sellers = Column(Integer, nullable=True)  # buybox competition signal
    date_first_available = Column(DateTime, nullable=True)

    category = relationship("Category", back_populates="products")
    reviews = relationship("Review", back_populates="product")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)

    product = relationship("Product", back_populates="reviews")
