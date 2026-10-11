# Authentication Flow

1. Firebase signs the user in and provides an ID token.
2. The frontend sends that token as a Bearer token to the API.
3. FastAPI verifies the token against `FIREBASE_PROJECT_ID`.
4. A new account registers its chosen buyer or seller role once.
5. The backend stores the Firebase UID, email, role, and creation time.
6. Registration is idempotent and never changes an existing role.
7. Every frontend session loads its role from `/auth/me`.
8. Protected analytics and seller-product routes check the stored role.
9. Seller analytics use that seller's products; category competition remains market-wide.
10. Public catalog, recommendations, and market-insight endpoints remain public.

Limitation: roles are self-selected at signup; a real product should require seller approval.