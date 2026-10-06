# CommerceIQ-AI

## Run with Docker

1. Copy the example env file at the repo root:
   ```bash
   copy .env.example .env
   ```
2. Start the app:
   ```bash
   docker compose up --build
   ```
3. Open the app in your browser:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000/docs
4. To reset the database and container state:
   ```bash
   docker compose down -v
   ```

If this project was downloaded into a same-named folder, this directory (the one containing this
README) is the project root. Run the setup commands below from this directory, not from its parent.

## Folder layout (yes, frontend + backend go in ONE folder)

```
CommerceIQ-AI/
├── .gitignore
├── README.md
├── backend/
│   ├── main.py  models.py  database.py  requirements.txt  .env.example
│   ├── data.csv                <-- copy your 1000-product CSV here
│   ├── scripts/load_data.py
│   └── src/recommendation/recommender.py  (+ __init__.py files)
└── frontend/
    ├── package.json, index.html, vite.config.ts ...   <-- your existing Vite files
    ├── .env.example
    └── src/  App.tsx  api.ts  firebase.ts  main.tsx  *.css  vite-env.d.ts
```
Copy the files from this download over your existing ones (keep your own
`package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `node_modules`).
One repo, one `git push`. Don't commit `.venv`, `node_modules`, `*.db`, `.env`
(the .gitignore already excludes them).

## Run it

**Backend** (terminal 1)
```
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows   (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python scripts/load_data.py       # builds ecommerce.db from data.csv (run once; re-run wipes + reloads)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend** (terminal 2)
```
cd frontend
copy .env.example .env            # Mac/Linux: cp .env.example .env
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173).

## How to test

1. **Backend health** – open http://127.0.0.1:8000/docs (Swagger). Expect:
   - `GET /products` -> 1000 items, `GET /categories` -> 28
   - `GET /products/3/market-insight` -> `BUY_NOW`, discount about -32%, 5 competitors
   - `GET /products/1/recommendations` -> 5 similar products
   - `GET /analytics/overview` -> totals, category breakdown, top discounts, trending
   - `GET /analytics/buyer` -> best_deals, wait_list, top_rated, trending
   - `GET /analytics/seller` (and `?category_id=2`) -> kpis, pricing_opportunities, margin_pressure, competition
2. **Frontend** – with backend running:
   - Products page: real products/images, category chips (28 real categories) filter correctly
   - Click a product: Market Insight (buy/wait badge, list vs current price, loss %, competitors),
     reviews, and "You may also like"
   - Click a competitor row: jumps to that product
   - **Gates:** logged out -> click Buyer/Seller Dashboard -> "Please log in". After login, first visit asks
     "Buyer or Seller?". A buyer opening the Seller Dashboard sees "Sellers only" + a switch button (and vice versa).
   - **Buyer Dashboard:** best deals, wait list, top rated, trending (click a row to open the product)
   - **Seller Dashboard:** category picker, KPIs, pricing opportunities, margin pressure, crowded categories,
     store-wide overview (all auto-refresh every 30s)
3. **Two laptops on the same Wi-Fi** – on the backend machine find its IP (`ipconfig`),
   then on the frontend machine set `VITE_API_BASE_URL=http://<that-ip>:8000` in `frontend/.env`
   and restart `npm run dev`. On the backend machine set
   `FRONTEND_ORIGINS=http://<frontend-ip>:5173` in `backend/.env` (allow port 8000 in the firewall).

## Notes
- "Real-time" = computed fresh from the database on every request (Insights page re-polls every 30s).
  There is no live Amazon feed; the data is the static scraped CSV.
- Buy/Wait is a transparent rule on discount depth (>=25% off BUY NOW, 10-25% GOOD DEAL, small/none WAIT,
  price above list PRICE RISING, no list price NO_DATA). It is a heuristic, not a forecast.
- "Profit/loss %" = current price vs original list price. True seller profit needs cost data, which isn't in the CSV.
- Competitors = products in the same category closest in price.
- **Rupees:** the CSV is mostly USD, so `load_data.py` converts to INR while loading (default 88 per USD, 115 per GBP).
  Change with `USD_TO_INR=90 python scripts/load_data.py`. Re-run the script after changing the rate.
- **Gates are UI-only (V1).** The role is stored per Firebase user in the browser's localStorage. It hides the
  dashboards but is not real security; the API endpoints are still open. Real enforcement needs Firebase custom
  claims or verifying the Firebase ID token in FastAPI.
- The seller dashboard is a market view (the CSV has no seller ownership or cost data): pricing signals compare each
  product to its category median price plus demand (`bought_past_month`) and rating.
