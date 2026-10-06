import unittest
import uuid

from fastapi.testclient import TestClient

import main
import models
from auth import get_token_verifier
from database import SessionLocal


class AuthEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def setUp(self):
        self.uid = f"auth-test-{uuid.uuid4().hex}"
        self.extra_uids = []

        def verify(token):
            if token == "invalid-token":
                raise ValueError("Token verification failed")
            return {"sub": token, "email": f"{token}@example.test"}

        main.app.dependency_overrides[get_token_verifier] = lambda: verify

    def tearDown(self):
        main.app.dependency_overrides.clear()
        db = SessionLocal()
        try:
            uids = [self.uid, *self.extra_uids]
            db.query(models.Product).filter(models.Product.seller_id.in_(uids)).delete()
            db.query(models.User).filter(models.User.uid.in_(uids)).delete()
            db.commit()
        finally:
            db.close()

    @staticmethod
    def headers(uid):
        return {"Authorization": f"Bearer {uid}"}

    def register(self, uid, role):
        return self.client.post(
            "/auth/register",
            headers=self.headers(uid),
            json={"role": role},
        )

    def test_analytics_requires_a_token(self):
        for path in ("/analytics/buyer", "/analytics/seller"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 401)
                self.assertIn("detail", response.json())

    def test_invalid_token_returns_401(self):
        response = self.client.get(
            "/analytics/seller",
            headers=self.headers("invalid-token"),
        )
        self.assertEqual(response.status_code, 401)

    def test_register_is_idempotent_and_role_is_immutable(self):
        first = self.register(self.uid, "buyer")
        second = self.register(self.uid, "seller")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["role"], "buyer")
        self.assertEqual(second.json()["role"], "buyer")
        self.assertEqual(
            self.client.get("/auth/me", headers=self.headers(self.uid)).json(),
            {"uid": self.uid, "email": f"{self.uid}@example.test", "role": "buyer"},
        )

    def test_register_rejects_unknown_roles(self):
        response = self.register(self.uid, "admin")
        self.assertEqual(response.status_code, 422)

    def test_analytics_role_matrix(self):
        buyer_uid = self.uid
        seller_uid = f"auth-test-{uuid.uuid4().hex}"
        self.register(buyer_uid, "buyer")
        self.register(seller_uid, "seller")

        buyer_seller_response = self.client.get(
            "/analytics/seller",
            headers=self.headers(buyer_uid),
        )
        seller_buyer_response = self.client.get(
            "/analytics/buyer",
            headers=self.headers(seller_uid),
        )
        buyer_response = self.client.get(
            "/analytics/buyer",
            headers=self.headers(buyer_uid),
        )
        seller_response = self.client.get(
            "/analytics/seller",
            headers=self.headers(seller_uid),
        )

        self.assertEqual(buyer_seller_response.status_code, 403)
        self.assertEqual(seller_buyer_response.status_code, 403)
        self.assertEqual(buyer_response.status_code, 200)
        self.assertEqual(seller_response.status_code, 200)
        self.assertEqual(
            set(seller_response.json()),
            {
                "generated_at",
                "scope",
                "kpis",
                "pricing_opportunities",
                "margin_pressure",
                "demand_snapshot",
                "competition",
            },
        )

    def test_unknown_user_must_register_before_using_analytics(self):
        response = self.client.get(
            "/analytics/seller",
            headers=self.headers(self.uid),
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("register", response.json()["detail"].lower())

    def test_seller_products_and_analytics_only_include_owned_products(self):
        other_uid = f"auth-test-{uuid.uuid4().hex}"
        self.extra_uids.append(other_uid)
        self.register(self.uid, "seller")
        self.register(other_uid, "seller")

        db = SessionLocal()
        try:
            db.add_all(
                [
                    models.Product(title="Owned listing", price=10, seller_id=self.uid),
                    models.Product(title="Other listing", price=20, seller_id=other_uid),
                ]
            )
            db.commit()
        finally:
            db.close()

        products = self.client.get(
            "/seller/products",
            headers=self.headers(self.uid),
        )
        dashboard = self.client.get(
            "/analytics/seller",
            headers=self.headers(self.uid),
        )

        self.assertEqual(products.status_code, 200)
        self.assertEqual([product["title"] for product in products.json()], ["Owned listing"])
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["kpis"]["product_count"], 1)


if __name__ == "__main__":
    unittest.main()