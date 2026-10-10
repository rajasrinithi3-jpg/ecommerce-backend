"""
Isolated tests for Task 1: Endpoint security (authentication, authorization, rate limiting, and input validation).
Uses an isolated temporary SQLite database so ecommerce.db is never touched.
Mocks the trusted token-verification boundary (verify_firebase_id_token).
"""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import Base, get_db
import main
from auth import AuthenticatedUser

class EndpointSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an isolated temporary database in a temporary directory
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_db_path = os.path.join(cls.temp_dir.name, "test_security.db")
        cls.test_engine = create_engine(
            f"sqlite:///{cls.test_db_path}",
            connect_args={"check_same_thread": False}
        )
        cls.TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.test_engine)
        Base.metadata.create_all(bind=cls.test_engine)

        # Seed minimal test data (1 category, 1 product)
        db = cls.TestSessionLocal()
        cls.test_category = models.Category(id=1, name="Electronics")
        cls.test_product = models.Product(
            id=1,
            title="Wireless Headphones",
            price=2999.0,
            category_id=1,
            description="Test headphone"
        )
        db.add(cls.test_category)
        db.add(cls.test_product)
        db.commit()
        db.close()

        def override_get_db():
            db_session = cls.TestSessionLocal()
            try:
                yield db_session
            finally:
                db_session.close()

        main.app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(main.app)

    @classmethod
    def tearDownClass(cls):
        main.app.dependency_overrides.clear()
        cls.temp_dir.cleanup()

    def setUp(self):
        main.review_rate_limiter.requests.clear()

    # --- Review Authentication & Rate Limiting Tests ---
    def test_review_creation_unauthenticated_returns_401(self):
        res = self.client.post("/products/1/reviews", json={"rating": 5, "comment": "Great!"})
        self.assertEqual(res.status_code, 401)

    @patch("main.get_current_user", return_value=AuthenticatedUser(uid="user_123"))
    def test_review_creation_authenticated_succeeds(self, _mock_user):
        res = self.client.post(
            "/products/1/reviews",
            json={"rating": 5, "comment": "Great product!"},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["rating"], 5)

    @patch("main.get_current_user", return_value=AuthenticatedUser(uid="user_123"))
    def test_review_creation_nonexistent_product_returns_404(self, _mock_user):
        res = self.client.post(
            "/products/99999/reviews",
            json={"rating": 5, "comment": "Nonexistent product"},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 404)

    @patch("main.get_current_user", return_value=AuthenticatedUser(uid="user_rate_limit"))
    def test_review_rate_limiting_enforces_5_per_minute(self, _mock_user):
        for i in range(5):
            res = self.client.post(
                "/products/1/reviews",
                json={"rating": 5, "comment": f"Review {i}"},
                headers={"Authorization": "Bearer valid_mock_token"}
            )
            self.assertEqual(res.status_code, 201)

        # 6th review within 60s should return 429
        res = self.client.post(
            "/products/1/reviews",
            json={"rating": 5, "comment": "Review 6 (exceeded)"},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 429)

    # --- Product Creation Tests ---
    def test_product_creation_unauthenticated_returns_401(self):
        res = self.client.post("/products", json={"title": "Item", "price": 100.0, "category_id": 1})
        self.assertEqual(res.status_code, 401)

    @patch("main.get_current_seller", return_value=AuthenticatedUser(uid="seller_456"))
    def test_product_creation_authenticated_sets_seller_id(self, _mock_seller):
        res = self.client.post(
            "/products",
            json={"title": "Smart Watch", "price": 4999.0, "category_id": 1},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["seller_id"], "seller_456")

    @patch("main.get_current_seller", return_value=AuthenticatedUser(uid="seller_456"))
    def test_product_creation_rejects_client_supplied_seller_id_non_null(self, _mock_seller):
        res = self.client.post(
            "/products",
            json={"title": "Smart Watch", "price": 4999.0, "category_id": 1, "seller_id": "attacker"},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 422)

    @patch("main.get_current_seller", return_value=AuthenticatedUser(uid="seller_456"))
    def test_product_creation_rejects_client_supplied_seller_id_null(self, _mock_seller):
        res = self.client.post(
            "/products",
            json={"title": "Smart Watch", "price": 4999.0, "category_id": 1, "seller_id": None},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 422)

    @patch("main.get_current_seller", return_value=AuthenticatedUser(uid="seller_456"))
    def test_product_creation_rejects_non_positive_price(self, _mock_seller):
        res_zero = self.client.post(
            "/products",
            json={"title": "Free Item", "price": 0.0, "category_id": 1},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res_zero.status_code, 422)

        res_neg = self.client.post(
            "/products",
            json={"title": "Negative Item", "price": -50.0, "category_id": 1},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res_neg.status_code, 422)

    @patch("main.get_current_seller", return_value=AuthenticatedUser(uid="seller_456"))
    def test_product_creation_rejects_nonexistent_category(self, _mock_seller):
        res = self.client.post(
            "/products",
            json={"title": "Invalid Cat Item", "price": 100.0, "category_id": 99999},
            headers={"Authorization": "Bearer valid_mock_token"}
        )
        self.assertEqual(res.status_code, 422)

if __name__ == "__main__":
    unittest.main()
