import {
  getProducts,
  getCategories,
  getProductReviews,
  getProductRecommendations,
  getMarketInsight,
  addProductReview,
  getAnalyticsOverview,
  getBuyerDashboard,
  getSellerDashboard,
  type BuyerDashboard as BuyerDashboardData,
  type SellerDashboard as SellerDashboardData,
  type BackendCategory,
  type BackendReview,
  type Recommendation,
  type MarketInsight,
  type AnalyticsOverview,
} from "./api";
import { useEffect, useState, type FormEvent } from "react";
import { Analytics } from './Analytics';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import ChatWidget from "./ChatWidget";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  rating: number;
  image: string;
  description?: string;
  brand?: string;
  categoryId?: number;
};

type Page =
  | "home"
  | "products"
  | "analytics"
  | "buyer"
  | "seller"
  | "cart"
  | "login"
  | "signup"
  | "details";


type Role = "buyer" | "seller";

// V1 role handling: the role is remembered per Firebase user in this
// browser (localStorage). It gates the UI only - it is NOT server-side
// security. Real enforcement would need Firebase custom claims or a
// verified-token check on the FastAPI side.
const ROLE_KEY = (uid: string) => `commerceiq_role_${uid}`;

function loadRole(uid: string): Role | null {
  try {
    const value = localStorage.getItem(ROLE_KEY(uid));
    return value === "buyer" || value === "seller" ? value : null;
  } catch {
    return null;
  }
}

function saveRole(uid: string, role: Role) {
  try {
    localStorage.setItem(ROLE_KEY(uid), role);
  } catch {
    /* storage unavailable - role just won't persist */
  }
}

// Fallback image used whenever the backend doesn't have a product image.
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85";

const colors = {
  mauve: "#9A7787",
  pink: "#E4AFB0",
  peach: "#FED7BF",
  light: "#FDF5F2",
  dark: "#624957",
  text: "#806F78",
};

function App() {
  const [page, setPage] = useState<Page>("home");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cartItems, setCartItems] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [backendProducts, setBackendProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<BackendCategory[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

useEffect(() => {
  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setBackendProducts(data);
      setDataError(null);
    } catch (error) {
      console.error("Error loading products:", error);
      setDataError(
        "Couldn't reach the backend. Check that the API server is running and reachable."
      );
    }
  };

  loadProducts();
}, []);

useEffect(() => {
  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  loadCategories();
}, []);

// Map category_id -> category name so real category names (not raw ids)
// show up on cards, the details page, and the filter chips.
const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

const backendMappedProducts: Product[] = backendProducts.map((product) => ({
  id: Number(product.id),
  name: product.title || "Untitled Product",
  category:
    categoryNameById.get(product.category_id) ??
    `Category ${product.category_id ?? "Unknown"}`,
  categoryId: product.category_id,
  price: Number(product.price ?? 0),
  rating: Number(product.rating ?? 4.5),
  image: product.image || FALLBACK_IMAGE,
  description: product.description || "",
  brand: product.brand || "",
}));

const categoryOptions = ["All", ...categories.map((c) => c.name)];

const filteredProducts = backendMappedProducts.filter((product) => {
  const matchesSearch =
    `${product.name} ${product.category} ${product.brand}`
      .toLowerCase()
      .includes(search.toLowerCase());

  const matchesCategory =
    category === "All" || product.category === category;

  return matchesSearch && matchesCategory;
});
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setRoleState(currentUser ? loadRole(currentUser.uid) : null);
  });

  return unsubscribe;
}, []);

const setRole = (newRole: Role) => {
  if (user) saveRole(user.uid, newRole);
  setRoleState(newRole);
};

  const addToCart = (product: Product) => {
    setCartItems((items) => [...items, product]);
  };

  const removeFromCart = (index: number) => {
    setCartItems((items) => items.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.light,
        color: colors.dark,
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          background: "#fff",
          borderBottom: `1px solid ${colors.pink}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "auto",
            padding: "18px 25px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setPage("home")}
            style={{
              border: "none",
              background: "none",
              fontSize: "24px",
              fontWeight: "800",
              color: colors.mauve,
              cursor: "pointer",
            }}
          >
            🛍️ CommerceIQ AI
          </button>

          <nav
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <NavButton text="Home" onClick={() => setPage("home")} />
            <NavButton
              text="Products"
              onClick={() => setPage("products")}
            />
            <NavButton
              text="Analytics"
              onClick={() => setPage("analytics")}
            />
            <NavButton
              text="Buyer Dashboard"
              onClick={() => setPage("buyer")}
            />
            <NavButton
              text="Seller Dashboard"
              onClick={() => setPage("seller")}
            />
            <NavButton
              text={`Cart (${cartItems.length})`}
              onClick={() => setPage("cart")}
            />
            {user ? (
  <>
    <span
      style={{
        padding: "10px 15px",
        color: colors.dark,
        fontWeight: "700",
      }}
    >
      Hi, {user.displayName || user.email?.split("@")[0]} 👋
      {role ? ` · ${role === "buyer" ? "🛒 Buyer" : "🏪 Seller"}` : ""}
    </span>

    <button
      onClick={async () => {
        await signOut(auth);
        setPage("home");
      }}
      style={{
        padding: "10px 18px",
        borderRadius: "10px",
        border: "1px solid #E4AFB0",
        background: "#fff",
        color: "#624957",
        fontWeight: "600",
        cursor: "pointer",
      }}
    >
      Logout
    </button>
  </>
) : (
  <>
    <NavButton
      text="Login"
      onClick={() => setPage("login")}
    />

    <button
      onClick={() => setPage("signup")}
      style={{
        padding: "10px 18px",
        borderRadius: "10px",
        border: "none",
        background: colors.mauve,
        color: "#fff",
        fontWeight: "700",
        cursor: "pointer",
      }}
    >
      Sign Up
    </button>
  </>
)}
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main
        style={{
          maxWidth: "1200px",
          margin: "auto",
          padding: "45px 25px",
        }}
      >
        {dataError && (
          <div
            style={{
              background: "#ffebee",
              color: "#c62828",
              border: "1px solid #c62828",
              borderRadius: "12px",
              padding: "12px 18px",
              marginBottom: "24px",
              fontWeight: 600,
            }}
          >
            {dataError}
          </div>
        )}

        {page === "home" && (
          <>
            <HomePage
              products={backendMappedProducts}
              onAdd={addToCart}
              onProducts={() => setPage("products")}
              onDetails={(product) => {
                setSelectedProduct(product);
                setPage("details");
              }}
            />
          </>
        )}

        {page === "products" && (
  <ProductsPage
    products={filteredProducts}
    search={search}
    onSearch={setSearch}
    category={category}
    onCategory={setCategory}
    categoryOptions={categoryOptions}
    onAdd={addToCart}
    onDetails={(product) => {
      setSelectedProduct(product);
      setPage("details");
    }}
  />
)}

{page === "analytics" && <Analytics />}

{page === "buyer" && (
  <RoleGate
    required="buyer"
    user={user}
    role={role}
    onSetRole={setRole}
    onLogin={() => setPage("login")}
    onSignup={() => setPage("signup")}
  >
    <BuyerDashboardPage
      onOpenProduct={(id) => {
        const match = backendMappedProducts.find((p) => p.id === id);
        if (match) {
          setSelectedProduct(match);
          setPage("details");
        }
      }}
    />
  </RoleGate>
)}

{page === "seller" && (
  <RoleGate
    required="seller"
    user={user}
    role={role}
    onSetRole={setRole}
    onLogin={() => setPage("login")}
    onSignup={() => setPage("signup")}
  >
    <SellerDashboardPage categories={categories} />
  </RoleGate>
)}

{page === "details" && selectedProduct && (
  <ProductDetailsPage
    product={selectedProduct}
    allProducts={backendMappedProducts}
    onAdd={addToCart}
    onBack={() => setPage("products")}
    onDetails={(product) => setSelectedProduct(product)}
  />
)}

{page === "cart" && (
  <CartPage
    cartItems={cartItems}
    onRemove={removeFromCart}
    onClear={clearCart}
  />
)}

{page === "login" && (
  <LoginPage
    onSignup={() => setPage("signup")}
    onHome={() => setPage("home")}
  />
)}

{page === "signup" && (
  <SignupPage
    onLogin={() => setPage("login")}
    onHome={() => setPage("home")}
  />
)}
      </main>

      {page !== "login" && page !== "signup" && (
        <ChatWidget
          onOpenProduct={(id) => {
            const match = backendMappedProducts.find((product) => product.id === id);
            if (match) {
              setSelectedProduct(match);
              setPage("details");
            }
          }}
        />
      )}

      {/* FOOTER */}
      <footer
        style={{
          marginTop: "50px",
          padding: "30px",
          textAlign: "center",
          background: colors.mauve,
          color: "#fff",
        }}
      >
        © 2026 CommerceIQ AI. All rights reserved.
      </footer>
    </div>
  );
}

/* ---------------- NAV BUTTON ---------------- */

function NavButton({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    onClick();

    setTimeout(() => {
      setClicked(false);
    }, 400);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        overflow: "hidden",

        padding: "10px 15px",
        borderRadius: "10px",
        border: `1px solid ${colors.pink}`,

        background: "#fff",
        color: hovered ? "#fff" : colors.dark,

        fontWeight: "600",
        cursor: "pointer",

        transition: "color 0.25s ease, box-shadow 0.2s ease",

        // ✨ Click glow
        boxShadow: clicked
          ? `0 0 0 5px rgba(154, 119, 135, 0.18),
             0 0 20px rgba(154, 119, 135, 0.45)`
          : "none",

        transform: clicked ? "scale(0.97)" : "scale(1)",
        zIndex: 1,
      }}
    >
      {/* Hover background sweep */}
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: hovered ? "100%" : "0%",
          height: "100%",
          background: colors.mauve,
          transition: "width 0.3s ease",
          zIndex: -1,
        }}
      />

      {text}
    </button>
  );
}

/* ---------------- HOME PAGE ---------------- */

function HomePage({
  products,
  onAdd,
  onProducts,
  onDetails,
}: {
  products: Product[];
  onAdd: (product: Product) => void;
  onProducts: () => void;
  onDetails: (product: Product) => void;
}) {
  return (
    <div>
      <section
        style={{
          borderRadius: "28px",
          padding: "70px 50px",
          background:
            "linear-gradient(135deg, #9A7787, #E4AFB0, #FED7BF)",
          color: "#fff",
          marginBottom: "55px",
        }}
      >
        <p style={{ fontWeight: "700", letterSpacing: "2px" }}>
          AI-POWERED SHOPPING
        </p>

        <h1
          style={{
            fontSize: "clamp(42px, 7vw, 72px)",
            margin: "15px 0",
            lineHeight: "1.05",
          }}
        >
          Shop Smarter
          <br />
          with AI ✨
        </h1>

        <p
          style={{
            maxWidth: "600px",
            fontSize: "19px",
            lineHeight: "1.7",
          }}
        >
          Discover useful products, explore intelligent insights,
          and enjoy a simple shopping experience.
        </p>

        <button
          onClick={onProducts}
          style={{
            marginTop: "25px",
            padding: "15px 25px",
            borderRadius: "12px",
            border: "none",
            background: "#fff",
            color: colors.mauve,
            fontWeight: "800",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          Explore Products →
        </button>
      </section>

      <h2 style={{ fontSize: "32px", marginBottom: "25px" }}>
        Featured Products
      </h2>

      <div style={gridStyle}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAdd={onAdd}
            onDetails={onDetails}
          />
        ))}
      </div>

      <section
        style={{
          marginTop: "55px",
          padding: "35px",
          background: "#fff",
          borderRadius: "22px",
          border: `1px solid ${colors.pink}`,
        }}
      >
        <h2>Why CommerceIQ AI?</h2>

        <div style={gridStyle}>
          <Feature
            icon="🔎"
            title="Smart Discovery"
            description="Find products quickly using search and categories."
          />

          <Feature
            icon="🤖"
            title="AI Insights"
            description="Understand shopping trends and product performance."
          />

          <Feature
            icon="🛒"
            title="Simple Cart"
            description="Add, remove and manage selected products easily."
          />
        </div>
      </section>
    </div>
  );
}

/* ---------------- PRODUCT PAGE ---------------- */

function ProductsPage({
  products,
  search,
  onSearch,
  category,
  onCategory,
  categoryOptions,
  onAdd,
  onDetails,
}: {
  products: Product[];
  search: string;
  onSearch: (value: string) => void;
  category: string;
  onCategory: (value: string) => void;
  categoryOptions: string[];
  onAdd: (product: Product) => void;
  onDetails: (product: Product) => void;
}) {
  return (
    <section>
      <h1 style={{ fontSize: "42px" }}>All Products</h1>

      <p style={{ color: colors.text }}>
        Explore our collection of useful products.
      </p>

      <p style={{ color: colors.mauve, fontWeight: "700", marginTop: "10px" }}>
        {products.length} products found
      </p>

      {/* SEARCH */}
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="🔎 Search products..."
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "16px",
          margin: "25px 0 35px",
          borderRadius: "12px",
          border: `1px solid ${colors.pink}`,
          fontSize: "16px",
          background: "#fff",
        }}
      />

      {/* CATEGORIES */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "35px",
        }}
      >
        {categoryOptions.map((item) => (
          <button
            key={item}
            onClick={() => onCategory(item)}
            style={{
              padding: "10px 18px",
              borderRadius: "20px",
              border: `1px solid ${colors.pink}`,
              background: category === item ? colors.mauve : "#fff",
              color: category === item ? "#fff" : colors.dark,
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* PRODUCTS */}
      {products.length === 0 ? (
        <div
          style={{
            padding: "50px",
            background: "#fff",
            borderRadius: "20px",
            textAlign: "center",
          }}
        >
          No products found 😔
        </div>
      ) : (
        <div style={gridStyle}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={onAdd}
              onDetails={onDetails}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- PRODUCT CARD ---------------- */

function ProductCard({
  product,
  onAdd,
  onDetails,
}: {
  product: Product;
  onAdd: (product: Product) => void;
  onDetails: (product: Product) => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "20px",
        overflow: "hidden",
        border: `1px solid ${colors.pink}`,
        boxShadow: "0 8px 25px rgba(154,119,135,0.10)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <img
        src={product.image}
        alt={product.name}
        style={{
          width: "100%",
          height: "230px",
          objectFit: "cover",
        }}
      />

      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <p
          style={{
            color: colors.mauve,
            fontWeight: "700",
            margin: 0,
          }}
        >
          {product.category}
        </p>

        {/* Title is clamped to 3 lines so cards stay the same height */}
        <h3
          title={product.name}
          style={{
            fontSize: "19px",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.name}
        </h3>

        <p style={{ color: colors.text }}>⭐ {product.rating} rating</p>

        <strong
          style={{
            fontSize: "23px",
            marginTop: "auto",
            paddingBottom: "12px",
            display: "block",
          }}
        >
          ₹{Math.round(product.price).toLocaleString("en-IN")}
        </strong>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => onAdd(product)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "10px",
              border: "none",
              background: colors.mauve,
              color: "#fff",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Add to Cart
          </button>
          <button
            type="button"
            onClick={() => onDetails(product)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "10px",
              border: `1px solid ${colors.pink}`,
              background: "#fff",
              color: colors.dark,
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
/* ---------------- PRODUCT DETAILS ---------------- */

function ProductDetailsPage({
  product,
  allProducts,
  onAdd,
  onBack,
  onDetails,
}: {
  product: Product;
  allProducts: Product[];
  onAdd: (product: Product) => void;
  onBack: () => void;
  onDetails: (product: Product) => void;
}) {
  const [reviews, setReviews] = useState<BackendReview[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketInsight, setMarketInsight] = useState<MarketInsight | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingExtras(true);

    const loadExtras = async () => {
      try {
        const [reviewData, recData, insightData] = await Promise.all([
          getProductReviews(product.id),
          getProductRecommendations(product.id),
          getMarketInsight(product.id).catch(() => null),
        ]);
        if (!cancelled) {
          setReviews(reviewData);
          setRecommendations(recData);
          setMarketInsight(insightData);
        }
      } catch (error) {
        console.error("Error loading product details:", error);
      } finally {
        if (!cancelled) setLoadingExtras(false);
      }
    };

    loadExtras();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  // Recommendations come back keyed by title (not id/price/image), so
  // match each one against the already-loaded product list to get a
  // full, clickable card. If no match is found, skip it rather than
  // showing a broken card.
  const recommendedProducts = recommendations
    .map((rec) =>
      allProducts.find(
        (p) => p.name.toLowerCase() === rec.title.toLowerCase()
      )
    )
    .filter((p): p is Product => Boolean(p));

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : product.rating;

  return (
    <section>
      <button
        onClick={onBack}
        style={{
          padding: "10px 18px",
          borderRadius: "10px",
          border: `1px solid ${colors.pink}`,
          background: "#fff",
          color: colors.dark,
          fontWeight: "700",
          cursor: "pointer",
          marginBottom: "25px",
        }}
      >
        ← Back to Products
      </button>

      <div
        style={{
          background: "#fff",
          borderRadius: "25px",
          padding: "30px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "40px",
          border: `1px solid ${colors.pink}`,
          boxShadow: "0 10px 30px rgba(154,119,135,0.12)",
        }}
      >
        {/* PRODUCT IMAGE */}
        <div>
          <img
            src={product.image}
            alt={product.name}
            style={{
              width: "100%",
              height: "450px",
              objectFit: "cover",
              borderRadius: "20px",
            }}
          />
        </div>

        {/* PRODUCT INFORMATION */}
        <div style={{ padding: "15px" }}>
          <p
            style={{
              color: colors.mauve,
              fontWeight: "700",
              fontSize: "17px",
            }}
          >
            {product.category}
            {product.brand ? ` · ${product.brand}` : ""}
          </p>

          <h1
            style={{
              fontSize: "42px",
              lineHeight: 1.1,
              letterSpacing: 0,
              margin: "10px 0 20px",
            }}
          >
            {product.name}
          </h1>

          <p
            style={{
              fontSize: "20px",
              color: colors.text,
            }}
          >
            ⭐ {averageRating.toFixed(1)} / 5
            {reviews.length > 0 ? ` (${reviews.length} reviews)` : ""}
          </p>

          <h2
            style={{
              fontSize: "36px",
              margin: "25px 0",
              color: colors.dark,
            }}
          >
            ₹{product.price.toLocaleString("en-IN")}
          </h2>

          <p
            style={{
              color: colors.text,
              fontSize: "17px",
              lineHeight: "1.8",
            }}
          >
            {product.description ||
              `Experience quality and convenience with the ${product.name}. This product is designed to provide a simple, useful and reliable shopping experience.`}
          </p>

          {/* ADD TO CART */}
          <button
            onClick={() => {
              onAdd(product);
              alert(`${product.name} added to cart! 🛒`);
            }}
            style={{
              width: "100%",
              padding: "16px",
              marginTop: "25px",
              borderRadius: "12px",
              border: "none",
              background: colors.mauve,
              color: "#fff",
              fontSize: "17px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            🛒 Add to Cart
          </button>
        </div>
      </div>

      {/* MARKET INSIGHT: BUY/WAIT, PROFIT/LOSS, COMPETITORS */}
      <div style={{ marginTop: "40px" }}>
        <h2 style={{ fontSize: "26px" }}>📊 Market Insight</h2>

        {loadingExtras ? (
          <p style={{ color: colors.text }}>Analyzing market data...</p>
        ) : !marketInsight ? (
          <p style={{ color: colors.text }}>
            Market insight isn't available for this product.
          </p>
        ) : (
          <MarketInsightPanel
            insight={marketInsight}
            onOpenCompetitor={(id) => {
              const match = allProducts.find((p) => p.id === id);
              if (match) onDetails(match);
            }}
          />
        )}
      </div>

      {/* REVIEWS */}
      <div style={{ marginTop: "40px" }}>
        <h2 style={{ fontSize: "26px" }}>Customer Reviews</h2>
        <p style={{ color: colors.text, marginBottom: "16px" }}>
          Reviews are posted anonymously.
        </p>

        {loadingExtras ? (
          <p style={{ color: colors.text }}>Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p style={{ color: colors.text }}>
            No reviews yet for this product.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {reviews.map((review) => (
              <div
                key={review.id}
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "18px 22px",
                  border: `1px solid ${colors.pink}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <strong style={{ color: colors.dark, fontSize: "14px" }}>Anonymous reviewer</strong>
                  <span aria-label={`${review.rating} out of 5 stars`} style={{ color: colors.mauve, whiteSpace: "nowrap" }}>
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} <span style={{ color: colors.text }}>({review.rating}/5)</span>
                  </span>
                </div>
                {review.comment && (
                  <p style={{ color: colors.text, marginTop: "8px" }}>
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setReviewSubmitting(true);
            setReviewError(null);
            try {
              const review = await addProductReview(product.id, reviewRating, reviewComment);
              setReviews((current) => [...current, review]);
              setReviewComment("");
            } catch (error) {
              setReviewError(error instanceof Error ? error.message : "Couldn't submit your review.");
            } finally {
              setReviewSubmitting(false);
            }
          }}
          style={{
            display: "grid",
            gap: "12px",
            maxWidth: "680px",
            marginTop: "20px",
            padding: "20px",
            background: "#fff",
            border: `1px solid ${colors.pink}`,
            borderRadius: "12px",
            textAlign: "left",
          }}
        >
          <h3 style={{ margin: 0, color: colors.dark }}>Write an anonymous review</h3>
          <label style={{ display: "grid", gap: "6px", color: colors.dark, fontWeight: 600 }}>
            Rating
            <select
              value={reviewRating}
              onChange={(event) => setReviewRating(Number(event.target.value))}
              style={{ padding: "10px", border: `1px solid ${colors.pink}`, borderRadius: "6px", color: colors.dark }}
            >
              {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} out of 5</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", color: colors.dark, fontWeight: 600 }}>
            Your comment
            <textarea
              required
              maxLength={1000}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              rows={4}
              placeholder="Share your experience with this product"
              style={{ boxSizing: "border-box", width: "100%", padding: "10px", border: `1px solid ${colors.pink}`, borderRadius: "6px", resize: "vertical" }}
            />
          </label>
          {reviewError && <p role="alert" style={{ color: "#b42318" }}>{reviewError}</p>}
          <button
            type="submit"
            disabled={reviewSubmitting || !reviewComment.trim()}
            style={{ justifySelf: "start", padding: "10px 16px", border: "none", borderRadius: "6px", background: colors.mauve, color: "#fff", fontWeight: 700, cursor: reviewSubmitting ? "wait" : "pointer" }}
          >
            {reviewSubmitting ? "Submitting..." : "Submit review"}
          </button>
        </form>
      </div>

      {/* AI RECOMMENDATIONS */}
      <div style={{ marginTop: "40px" }}>
        <h2 style={{ fontSize: "26px" }}>🤖 You may also like</h2>

        {loadingExtras ? (
          <p style={{ color: colors.text }}>Finding similar products...</p>
        ) : recommendedProducts.length === 0 ? (
          <p style={{ color: colors.text }}>
            No AI recommendations available for this product yet.
          </p>
        ) : (
          <div style={gridStyle}>
            {recommendedProducts.map((rec) => (
              <ProductCard
                key={rec.id}
                product={rec}
                onAdd={onAdd}
                onDetails={onDetails}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
/* ---------------- INSIGHTS ---------------- */

const buyWaitStyles: Record<string, { label: string; bg: string; fg: string }> = {
  BUY_NOW: { label: "✅ BUY NOW", bg: "#e8f5e9", fg: "#2e7d32" },
  GOOD_DEAL: { label: "👍 GOOD DEAL", bg: "#f1f8e9", fg: "#558b2f" },
  WAIT: { label: "⏳ WAIT", bg: "#fff8e1", fg: "#b26a00" },
  PRICE_RISING: { label: "📈 PRICE RISING", bg: "#ffebee", fg: "#c62828" },
  NO_DATA: { label: "ℹ️ NOT ENOUGH DATA", bg: "#eeeeee", fg: "#616161" },
};

function MarketInsightPanel({
  insight,
  onOpenCompetitor,
}: {
  insight: MarketInsight;
  onOpenCompetitor: (id: number) => void;
}) {
  const { profit_loss, buy_or_wait, competitors } = insight;
  const style = buyWaitStyles[buy_or_wait.recommendation] ?? buyWaitStyles.NO_DATA;

  const pct = profit_loss.discount_pct;
  // Negative = price is below list (seller is taking a cut / buyer saves).
  const pctColor = pct === null ? colors.text : pct < 0 ? "#2e7d32" : "#c62828";

  const ageYears =
    profit_loss.listing_age_days !== null
      ? (profit_loss.listing_age_days / 365).toFixed(1)
      : null;

  const box: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${colors.pink}`,
    borderRadius: "16px",
    padding: "20px 22px",
    textAlign: "left",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* BUYER: BUY / WAIT */}
      <div style={{ ...box, background: style.bg, borderColor: style.fg }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: "20px", color: style.fg }}>
          Buyer signal: {style.label}
        </p>
        <p style={{ margin: "8px 0 0", color: colors.text }}>{buy_or_wait.reason}</p>
      </div>

      {/* SELLER: PROFIT / LOSS */}
      <div style={box}>
        <p style={{ margin: 0, fontWeight: 700, color: colors.mauve }}>
          Seller view: price vs. list price
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px",
            marginTop: "12px",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: "13px" }}>Original list price</p>
            <p style={{ margin: 0, fontWeight: 700, color: colors.dark, fontSize: "20px" }}>
              {profit_loss.initial_price !== null
                ? `₹${profit_loss.initial_price.toLocaleString("en-IN")}`
                : "—"}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "13px" }}>Current price</p>
            <p style={{ margin: 0, fontWeight: 700, color: colors.dark, fontSize: "20px" }}>
              ₹{profit_loss.current_price.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "13px" }}>
              {pct !== null && pct > 0 ? "Gain vs. list" : "Loss vs. list"}
            </p>
            <p style={{ margin: 0, fontWeight: 800, color: pctColor, fontSize: "20px" }}>
              {pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "13px" }}>Time on market</p>
            <p style={{ margin: 0, fontWeight: 700, color: colors.dark, fontSize: "20px" }}>
              {ageYears !== null ? `${ageYears} yrs` : "—"}
            </p>
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: "13px" }}>
          Based on the listed price vs. the current price in the dataset. Actual
          seller profit depends on cost, which isn't in the data.
        </p>
      </div>

      {/* COMPETITORS */}
      <div style={box}>
        <p style={{ margin: 0, fontWeight: 700, color: colors.mauve }}>
          Competing products in this category (closest price)
        </p>
        {competitors.length === 0 ? (
          <p style={{ color: colors.text }}>No comparable products found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            {competitors.map((c) => (
              <div
                key={c.id}
                onClick={() => onOpenCompetitor(c.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.pink}`,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: colors.dark, fontWeight: 600 }}>
                  {c.title.length > 70 ? c.title.slice(0, 70) + "…" : c.title}
                </span>
                <span style={{ whiteSpace: "nowrap", color: colors.text }}>
                  ₹{c.price.toLocaleString("en-IN")}
                  {c.price_diff_pct !== null && (
                    <strong
                      style={{
                        marginLeft: "8px",
                        color: c.price_diff_pct > 0 ? "#c62828" : "#2e7d32",
                      }}
                    >
                      {c.price_diff_pct > 0 ? "+" : ""}
                      {c.price_diff_pct}%
                    </strong>
                  )}
                  {c.rating !== null ? ` · ⭐ ${c.rating}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ---------------- ROLE GATE + DASHBOARDS ---------------- */

function RoleGate({
  required,
  user,
  role,
  onSetRole,
  onLogin,
  onSignup,
  children,
}: {
  required: Role;
  user: User | null;
  role: Role | null;
  onSetRole: (role: Role) => void;
  onLogin: () => void;
  onSignup: () => void;
  children: React.ReactNode;
}) {
  const label = required === "buyer" ? "Buyer" : "Seller";
  const icon = required === "buyer" ? "🛒" : "🏪";

  const card: React.CSSProperties = {
    maxWidth: "520px",
    margin: "40px auto",
    background: "#fff",
    border: `1px solid ${colors.pink}`,
    borderRadius: "22px",
    padding: "36px 30px",
    boxShadow: "0 10px 30px rgba(154,119,135,0.12)",
  };

  const primary: React.CSSProperties = {
    padding: "12px 22px",
    borderRadius: "12px",
    border: "none",
    background: colors.mauve,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "15px",
  };

  const secondary: React.CSSProperties = {
    ...primary,
    background: "#fff",
    color: colors.dark,
    border: `1px solid ${colors.pink}`,
  };

  // Gate 1: must be signed in.
  if (!user) {
    return (
      <div style={card}>
        <div style={{ fontSize: "40px" }}>🔒</div>
        <h2>{label} Dashboard</h2>
        <p style={{ color: colors.text }}>
          Please log in to access the {label.toLowerCase()} dashboard.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px" }}>
          <button style={primary} onClick={onLogin}>Login</button>
          <button style={secondary} onClick={onSignup}>Sign Up</button>
        </div>
      </div>
    );
  }

  // Gate 2: signed in, but hasn't picked a role yet.
  if (!role) {
    return (
      <div style={card}>
        <div style={{ fontSize: "40px" }}>👋</div>
        <h2>How will you use CommerceIQ?</h2>
        <p style={{ color: colors.text }}>
          Pick a role to continue. You can switch it later from a dashboard gate.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px" }}>
          <button style={primary} onClick={() => onSetRole("buyer")}>🛒 I'm a Buyer</button>
          <button style={primary} onClick={() => onSetRole("seller")}>🏪 I'm a Seller</button>
        </div>
      </div>
    );
  }

  // Gate 3: wrong role for this dashboard.
  if (role !== required) {
    return (
      <div style={card}>
        <div style={{ fontSize: "40px" }}>{icon}</div>
        <h2>{label}s only</h2>
        <p style={{ color: colors.text }}>
          You're signed in as a {role}. The {label.toLowerCase()} dashboard is for {label.toLowerCase()}s.
        </p>
        <div style={{ marginTop: "20px" }}>
          <button style={primary} onClick={() => onSetRole(required)}>
            Switch to {label} role
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardList({
  rows,
  empty,
}: {
  rows: { key: number; title: string; right: React.ReactNode; sub?: string; onClick?: () => void }[];
  empty: string;
}) {
  if (rows.length === 0) return <p style={{ color: colors.text }}>{empty}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {rows.map((r) => (
        <div
          key={r.key}
          onClick={r.onClick}
          style={{
            background: "#fff",
            border: `1px solid ${colors.pink}`,
            borderRadius: "14px",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            textAlign: "left",
            cursor: r.onClick ? "pointer" : "default",
          }}
        >
          <div>
            <div style={{ color: colors.dark, fontWeight: 600 }}>
              {r.title.length > 80 ? r.title.slice(0, 80) + "…" : r.title}
            </div>
            {r.sub && <div style={{ fontSize: "13px", color: colors.text, marginTop: "4px" }}>{r.sub}</div>}
          </div>
          <div style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{r.right}</div>
        </div>
      ))}
    </div>
  );
}

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;

function useAutoRefresh<T>(loader: () => Promise<T>, deps: unknown[], ms = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await loader();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Couldn't load data from the backend.");
      }
    };
    load();
    const timer = setInterval(load, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error };
}

function BuyerDashboardPage({ onOpenProduct }: { onOpenProduct: (id: number) => void }) {
  const { data, error } = useAutoRefresh<BuyerDashboardData>(getBuyerDashboard, []);

  if (error) return <section><h1 style={{ fontSize: "42px" }}>Buyer Dashboard 🛒</h1><p style={{ color: colors.text }}>{error}</p></section>;
  if (!data) return <section><h1 style={{ fontSize: "42px" }}>Buyer Dashboard 🛒</h1><p style={{ color: colors.text }}>Loading...</p></section>;

  const h2: React.CSSProperties = { fontSize: "26px", marginTop: "36px" };

  return (
    <section>
      <h1 style={{ fontSize: "42px" }}>Buyer Dashboard 🛒</h1>
      <p style={{ color: colors.text }}>Where to buy now, and what to hold off on. Refreshes every 30s.</p>

      <h2 style={h2}>✅ Buy now: best deals</h2>
      <DashboardList
        empty="No deep discounts right now."
        rows={data.best_deals.map((p) => ({
          key: p.id,
          title: p.title,
          sub: `${inr(p.initial_price)} → ${inr(p.price)}${p.rating ? ` · ⭐ ${p.rating}` : ""}`,
          right: <span style={{ color: "#2e7d32" }}>{p.discount_pct?.toFixed(0)}%</span>,
          onClick: () => onOpenProduct(p.id),
        }))}
      />

      <h2 style={h2}>⏳ Wait: priced above list</h2>
      <DashboardList
        empty="Nothing is currently priced above its list price."
        rows={data.wait_list.map((p) => ({
          key: p.id,
          title: p.title,
          sub: `${inr(p.initial_price)} → ${inr(p.price)}`,
          right: <span style={{ color: "#c62828" }}>+{p.discount_pct?.toFixed(0)}%</span>,
          onClick: () => onOpenProduct(p.id),
        }))}
      />

      <h2 style={h2}>⭐ Top rated & trusted</h2>
      <DashboardList
        empty="No data."
        rows={data.top_rated.map((p) => ({
          key: p.id,
          title: p.title,
          sub: `${p.reviews_count?.toLocaleString("en-IN")} reviews · ${inr(p.price)}`,
          right: <span style={{ color: colors.mauve }}>⭐ {p.rating}</span>,
          onClick: () => onOpenProduct(p.id),
        }))}
      />

      <h2 style={h2}>🔥 Trending (bought last month)</h2>
      <DashboardList
        empty="No demand data."
        rows={data.trending.map((p) => ({
          key: p.id,
          title: p.title,
          sub: inr(p.price),
          right: <span style={{ color: colors.mauve }}>{p.bought_past_month?.toLocaleString("en-IN")}+</span>,
          onClick: () => onOpenProduct(p.id),
        }))}
      />
    </section>
  );
}

const signalStyles: Record<string, { label: string; color: string }> = {
  RAISE_PRICE: { label: "📈 Raise price", color: "#2e7d32" },
  SELL_NOW: { label: "🚀 Sell now", color: "#1565c0" },
  REDUCE_PRICE: { label: "📉 Reduce price", color: "#c62828" },
};

function SellerDashboardPage({ categories }: { categories: BackendCategory[] }) {
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const { data, error } = useAutoRefresh<SellerDashboardData>(
    () => getSellerDashboard(categoryId),
    [categoryId]
  );

  const h2: React.CSSProperties = { fontSize: "26px", marginTop: "36px" };

  return (
    <section>
      <h1 style={{ fontSize: "42px" }}>Seller Dashboard 🏪</h1>
      <p style={{ color: colors.text }}>
        Market view: pricing, margin pressure and competition. Refreshes every 30s.
      </p>

      <select
        value={categoryId ?? ""}
        onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
        style={{
          padding: "10px 14px",
          borderRadius: "10px",
          border: `1px solid ${colors.pink}`,
          background: "#fff",
          color: colors.dark,
          fontSize: "15px",
          marginTop: "10px",
        }}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {error && <p style={{ color: colors.text }}>{error}</p>}
      {!data && !error && <p style={{ color: colors.text }}>Loading...</p>}

      {data && (
        <>
          <h2 style={h2}>{data.scope}</h2>
          <div style={gridStyle}>
            <InsightCard icon="📦" title="Products" value={String(data.kpis.product_count)} description="Listings in this view." />
            <InsightCard icon="💰" title="Median Price" value={inr(data.kpis.median_price)} description={`Average ${inr(data.kpis.avg_price)}`} />
            <InsightCard
              icon="🏷️"
              title="Avg Price Change"
              value={data.kpis.avg_discount_pct !== null ? `${data.kpis.avg_discount_pct}%` : "—"}
              description="Current vs list price (negative = margin given away)."
            />
            <InsightCard
              icon="🥊"
              title="Competition"
              value={data.kpis.avg_sellers_per_product !== null ? String(data.kpis.avg_sellers_per_product) : "—"}
              description="Average sellers per product."
            />
          </div>

          <h2 style={h2}>📊 Estimated weekly demand</h2>
          <p style={{ color: colors.text, marginBottom: "14px" }}>
            Average weekly units estimated from each product's reported purchases last month.
          </p>
          {data.demand_snapshot.length === 0 ? (
            <p style={{ color: colors.text }}>No recent purchase data in this view.</p>
          ) : (
            <div
              role="group"
              aria-label="Estimated weekly demand by product"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "20px 22px",
                border: `1px solid ${colors.pink}`,
                borderRadius: "16px",
                background: "#fff",
              }}
            >
              {data.demand_snapshot.map((item) => {
                const maxUnits = Math.max(...data.demand_snapshot.map((row) => row.estimated_weekly_units), 1);
                const width = Math.max(3, (item.estimated_weekly_units / maxUnits) * 100);
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr auto", alignItems: "center", gap: "12px", textAlign: "left" }}>
                    <span title={item.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.dark, fontSize: "14px" }}>
                      {item.title}
                    </span>
                    <div style={{ height: "12px", overflow: "hidden", borderRadius: "6px", background: colors.light }}>
                      <div
                        role="img"
                        aria-label={`${item.estimated_weekly_units} estimated units per week`}
                        style={{ width: `${width}%`, height: "100%", borderRadius: "6px", background: colors.mauve }}
                      />
                    </div>
                    <strong style={{ minWidth: "72px", color: colors.dark, fontSize: "13px", textAlign: "right" }}>
                      {item.estimated_weekly_units.toLocaleString("en-IN")} / wk
                    </strong>
                  </div>
                );
              })}
            </div>
          )}

          <h2 style={h2}>💡 Pricing opportunities</h2>
          <DashboardList
            empty="No clear pricing moves in this view."
            rows={data.pricing_opportunities.map((o) => {
              const st = signalStyles[o.signal];
              return {
                key: o.id,
                title: o.title,
                sub: o.reason,
                right: <span style={{ color: st.color }}>{st.label}</span>,
              };
            })}
          />

          <h2 style={h2}>📉 Margin pressure (deepest price cuts)</h2>
          <DashboardList
            empty="No discount data."
            rows={data.margin_pressure.map((p) => ({
              key: p.id,
              title: p.title,
              sub: `${inr(p.initial_price)} → ${inr(p.price)}`,
              right: <span style={{ color: "#c62828" }}>{p.discount_pct.toFixed(0)}%</span>,
            }))}
          />

          <h2 style={h2}>🥊 Most crowded categories</h2>
          <DashboardList
            empty="No data."
            rows={data.competition.map((c) => ({
              key: c.category_id,
              title: c.category,
              sub: `${c.product_count} products · ${c.avg_sellers_per_product ?? "—"} sellers/product · avg change ${c.avg_discount_pct ?? "—"}%`,
              right: <span style={{ color: colors.mauve }}>{c.product_count}</span>,
            }))}
          />

          <h2 style={{ ...h2, marginBottom: 0 }}>🌐 Store-wide overview</h2>
          <InsightsPage embedded />
        </>
      )}
    </section>
  );
}

function InsightsPage({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // "Real-time": re-query the backend every 30s so the numbers reflect
  // whatever is currently in the database.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const overview = await getAnalyticsOverview();
        if (!cancelled) {
          setData(overview);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (e) {
        if (!cancelled) setError("Couldn't load analytics from the backend.");
        console.error(e);
      }
    };

    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <section>
        <h1 style={{ fontSize: "42px" }}>AI Insights 🤖</h1>
        <p style={{ color: colors.text }}>{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section>
        <h1 style={{ fontSize: "42px" }}>AI Insights 🤖</h1>
        <p style={{ color: colors.text }}>Loading analytics...</p>
      </section>
    );
  }

  const topCategory = data.category_breakdown[0];
  const maxCount = Math.max(...data.category_breakdown.map((c) => c.product_count), 1);

  return (
    <section>
      {!embedded && <h1 style={{ fontSize: "42px" }}>AI Insights 🤖</h1>}

      <p style={{ color: colors.text }}>
        Live analytics computed from the product database
        {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ""}
      </p>

      <div style={gridStyle}>
        <InsightCard
          icon="📦"
          title="Total Products"
          value={data.total_products.toLocaleString("en-IN")}
          description={`Across ${data.total_categories} categories.`}
        />
        <InsightCard
          icon="⭐"
          title="Average Rating"
          value={data.average_rating !== null ? data.average_rating.toFixed(2) : "—"}
          description="Mean customer rating across the catalog."
        />
        <InsightCard
          icon="🏷️"
          title="Average Discount"
          value={
            data.average_discount_pct !== null
              ? `${data.average_discount_pct.toFixed(1)}%`
              : "—"
          }
          description="Average price change vs. original list price (negative = cheaper)."
        />
        {topCategory && (
          <InsightCard
            icon="🔥"
            title="Biggest Category"
            value={String(topCategory.product_count)}
            description={`${topCategory.category} has the most products.`}
          />
        )}
      </div>

      {/* CATEGORY BREAKDOWN */}
      <h2 style={{ fontSize: "26px", marginTop: "40px" }}>Category Breakdown</h2>
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          border: `1px solid ${colors.pink}`,
          padding: "20px 24px",
        }}
      >
        {data.category_breakdown.map((cat) => (
          <div key={cat.category} style={{ marginBottom: "14px", textAlign: "left" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: colors.dark,
                fontWeight: 600,
                fontSize: "15px",
              }}
            >
              <span>{cat.category}</span>
              <span style={{ color: colors.text, fontWeight: 400 }}>
                {cat.product_count} products · avg ₹{cat.avg_price.toLocaleString("en-IN")}
                {cat.avg_rating !== null ? ` · ⭐ ${cat.avg_rating}` : ""}
              </span>
            </div>
            <div
              style={{
                height: "8px",
                borderRadius: "6px",
                background: colors.light,
                marginTop: "6px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(cat.product_count / maxCount) * 100}%`,
                  borderRadius: "6px",
                  background: colors.mauve,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* TOP DISCOUNTS */}
      <h2 style={{ fontSize: "26px", marginTop: "40px" }}>Biggest Price Drops</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {data.top_discounts.map((p) => (
          <div
            key={p.id}
            style={{
              background: "#fff",
              border: `1px solid ${colors.pink}`,
              borderRadius: "14px",
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              textAlign: "left",
            }}
          >
            <span style={{ color: colors.dark, fontWeight: 600 }}>
              {p.title.length > 80 ? p.title.slice(0, 80) + "…" : p.title}
            </span>
            <span style={{ color: "#2e7d32", fontWeight: 700, whiteSpace: "nowrap" }}>
              {p.discount_pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {/* TRENDING */}
      <h2 style={{ fontSize: "26px", marginTop: "40px" }}>Trending (bought last month)</h2>
      {data.trending.length === 0 ? (
        <p style={{ color: colors.text }}>No demand data available.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.trending.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#fff",
                border: `1px solid ${colors.pink}`,
                borderRadius: "14px",
                padding: "14px 20px",
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                textAlign: "left",
              }}
            >
              <span style={{ color: colors.dark, fontWeight: 600 }}>
                {p.title.length > 80 ? p.title.slice(0, 80) + "…" : p.title}
              </span>
              <span style={{ color: colors.mauve, fontWeight: 700, whiteSpace: "nowrap" }}>
                {p.bought_past_month.toLocaleString("en-IN")}+
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function InsightCard({
  icon,
  title,
  value,
  description,
}: {
  icon: string;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        padding: "30px",
        borderRadius: "20px",
        border: `1px solid ${colors.pink}`,
      }}
    >
      <div style={{ fontSize: "35px" }}>{icon}</div>

      <p style={{ color: colors.mauve, fontWeight: "700" }}>
        {title}
      </p>

      <h2 style={{ fontSize: "42px", margin: "10px 0" }}>
        {value}
      </h2>

      <p style={{ color: colors.text }}>{description}</p>
    </div>
  );
}

/* ---------------- CART ---------------- */

function CartPage({
  cartItems,
  onRemove,
  onClear,
}: {
  cartItems: Product[];
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  const total = cartItems.reduce(
    (sum, product) => sum + product.price,
    0
  );

  return (
    <section>
      <h1 style={{ fontSize: "42px" }}>Your Cart 🛒</h1>

      {cartItems.length === 0 ? (
        <div
          style={{
            background: "#fff",
            padding: "60px",
            borderRadius: "20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "60px" }}>🛒</div>
          <h2>Your cart is empty</h2>
          <p style={{ color: colors.text }}>
            Add some products to get started.
          </p>
        </div>
      ) : (
        <>
          {cartItems.map((product, index) => (
            <div
              key={`${product.id}-${index}`}
              style={{
                background: "#fff",
                marginTop: "15px",
                padding: "18px",
                borderRadius: "15px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "20px",
                flexWrap: "wrap",
                border: `1px solid ${colors.pink}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                }}
              >
                <img
                  src={product.image}
                  alt={product.name}
                  style={{
                    width: "80px",
                    height: "80px",
                    objectFit: "cover",
                    borderRadius: "10px",
                  }}
                />

                <div>
                  <h3 style={{ margin: 0 }}>{product.name}</h3>
                  <p style={{ color: colors.text }}>
                    ₹{product.price.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onRemove(index)}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderRadius: "10px",
                  background: "#f7d9d9",
                  color: "#a33",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}

          <div
            style={{
              marginTop: "25px",
              padding: "25px",
              background: "#fff",
              borderRadius: "18px",
              border: `1px solid ${colors.pink}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
  <strong>Total</strong>
  ₹{total.toLocaleString("en-IN")}
</div>

            <button
              onClick={onClear}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                border: "none",
                background: colors.mauve,
                color: "#fff",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Clear Cart
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- LOGIN ---------------- */

function LoginPage({
  onSignup,
  onHome,
}: {
  onSignup: () => void;
  onHome: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      alert("Please enter email and password ❌");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);

      // Selected role for this login session
      localStorage.setItem("userRole", role);

      alert(
        `Login successful! 🎉\nLogged in as ${
          role === "buyer" ? "Buyer 🛍️" : "Seller 🏪"
        }`
      );
    } catch (error: any) {
      console.error("Firebase Login Error:", error);

      if (error.code === "auth/invalid-credential") {
        alert("Invalid email or password ❌");
      } else if (error.code === "auth/user-not-found") {
        alert("No account found with this email ❌");
      } else if (error.code === "auth/wrong-password") {
        alert("Wrong password ❌");
      } else {
        alert(`Login Error:\n\n${error.message}`);
      }
    }
  };

  return (
    <div
      style={{
        minHeight: "80vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "450px",
          background: "#fff",
          padding: "35px",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: "10px" }}>
          Welcome Back 👋
        </h2>

        <p style={{ textAlign: "center", marginBottom: "30px" }}>
          Login to your CommerceIQ account
        </p>

        <form onSubmit={handleLogin}>
          {/* Email */}
          <label style={{ fontWeight: "600" }}>Email</label>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "8px",
              marginBottom: "20px",
              borderRadius: "10px",
              border: "1px solid #e4afb0",
              boxSizing: "border-box",
            }}
          />

          {/* Password */}
          <label style={{ fontWeight: "600" }}>Password</label>

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "8px",
              marginBottom: "25px",
              borderRadius: "10px",
              border: "1px solid #e4afb0",
              boxSizing: "border-box",
            }}
          />

          {/* ROLE */}
          <label
            style={{
              fontWeight: "600",
              display: "block",
              marginBottom: "12px",
            }}
          >
            Login as
          </label>

          <div
            style={{
              display: "flex",
              gap: "15px",
              marginBottom: "25px",
            }}
          >
            {/* Buyer */}
            <label
              style={{
                flex: 1,
                padding: "15px",
                borderRadius: "12px",
                border:
                  role === "buyer"
                    ? "2px solid #9A7787"
                    : "1px solid #ddd",
                background: role === "buyer" ? "#FDF5F2" : "#fff",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <input
                type="radio"
                name="role"
                value="buyer"
                checked={role === "buyer"}
                onChange={() => setRole("buyer")}
                style={{ marginRight: "8px" }}
              />
              🛍️ Buyer
            </label>

            {/* Seller */}
            <label
              style={{
                flex: 1,
                padding: "15px",
                borderRadius: "12px",
                border:
                  role === "seller"
                    ? "2px solid #9A7787"
                    : "1px solid #ddd",
                background: role === "seller" ? "#FDF5F2" : "#fff",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <input
                type="radio"
                name="role"
                value="seller"
                checked={role === "seller"}
                onChange={() => setRole("seller")}
                style={{ marginRight: "8px" }}
              />
              🏪 Seller
            </label>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: "12px",
              background: "#9A7787",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Login 🚀
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "25px" }}>
          Don't have an account?{" "}
          <button
            onClick={onSignup}
            style={{
              border: "none",
              background: "none",
              color: "#9A7787",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Sign Up
          </button>
        </p>

        <button
          onClick={onHome}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "10px",
            border: "none",
            background: "transparent",
            color: "#806F78",
            cursor: "pointer",
          }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}

/* ---------------- SIGNUP ---------------- */

function SignupPage({
  onLogin,
  onHome,
}: {
  onLogin: () => void;
  onHome: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name || !email || !password) {
      alert("Please fill all fields ❌");
      return;
    }

    if (password.length < 6) {
      alert("Password must contain at least 6 characters ❌");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(userCredential.user, {
        displayName: name,
      });
onHome();
      // Save selected role
      localStorage.setItem("userRole", role);

      alert(
        `Account created successfully! 🎉\nYou registered as ${
          role === "buyer" ? "Buyer 🛍️" : "Seller 🏪"
        }`
      );
    } catch (error: any) {
      console.error("Firebase Signup Error:", error);

      if (error.code === "auth/email-already-in-use") {
        alert("This email is already registered ❌");
      } else if (error.code === "auth/weak-password") {
        alert("Password is too weak ❌");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid email address ❌");
      } else {
        alert(`Signup Error:\n\n${error.message}`);
      }
    }
  };

  return (
    <div
      style={{
        minHeight: "80vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "450px",
          background: "#fff",
          padding: "35px",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: "10px" }}>
          Create Account ✨
        </h2>

        <p style={{ textAlign: "center", marginBottom: "30px" }}>
          Join CommerceIQ
        </p>

        <form onSubmit={handleSignup}>
          {/* Name */}
          <label style={{ fontWeight: "600" }}>Full Name</label>

          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "8px",
              marginBottom: "20px",
              borderRadius: "10px",
              border: "1px solid #e4afb0",
              boxSizing: "border-box",
            }}
          />

          {/* Email */}
          <label style={{ fontWeight: "600" }}>Email</label>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "8px",
              marginBottom: "20px",
              borderRadius: "10px",
              border: "1px solid #e4afb0",
              boxSizing: "border-box",
            }}
          />

          {/* Password */}
          <label style={{ fontWeight: "600" }}>Password</label>

          <input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "8px",
              marginBottom: "25px",
              borderRadius: "10px",
              border: "1px solid #e4afb0",
              boxSizing: "border-box",
            }}
          />

          {/* ROLE */}
          <label
            style={{
              fontWeight: "600",
              display: "block",
              marginBottom: "12px",
            }}
          >
            I am a
          </label>

          <div
            style={{
              display: "flex",
              gap: "15px",
              marginBottom: "25px",
            }}
          >
            {/* Buyer */}
            <label
              style={{
                flex: 1,
                padding: "15px",
                borderRadius: "12px",
                border:
                  role === "buyer"
                    ? "2px solid #9A7787"
                    : "1px solid #ddd",
                background: role === "buyer" ? "#FDF5F2" : "#fff",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <input
                type="radio"
                name="signupRole"
                value="buyer"
                checked={role === "buyer"}
                onChange={() => setRole("buyer")}
                style={{ marginRight: "8px" }}
              />
              🛍️ Buyer
            </label>

            {/* Seller */}
            <label
              style={{
                flex: 1,
                padding: "15px",
                borderRadius: "12px",
                border:
                  role === "seller"
                    ? "2px solid #9A7787"
                    : "1px solid #ddd",
                background: role === "seller" ? "#FDF5F2" : "#fff",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <input
                type="radio"
                name="signupRole"
                value="seller"
                checked={role === "seller"}
                onChange={() => setRole("seller")}
                style={{ marginRight: "8px" }}
              />
              🏪 Seller
            </label>
          </div>

          {/* Signup Button */}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: "12px",
              background: "#9A7787",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Create Account 🚀
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "25px" }}>
          Already have an account?{" "}
          <button
            onClick={onLogin}
            style={{
              border: "none",
              background: "none",
              color: "#9A7787",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Login
          </button>
        </p>

        <button
          onClick={onHome}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "10px",
            border: "none",
            background: "transparent",
            color: "#806F78",
            cursor: "pointer",
          }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}

/* ---------------- FEATURES ---------------- */

function Feature({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: "25px",
        background: colors.light,
        borderRadius: "16px",
      }}
    >
      <div style={{ fontSize: "35px" }}>{icon}</div>

      <h3 style={{ color: colors.mauve }}>{title}</h3>

      <p style={{ color: colors.text }}>{description}</p>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "25px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  marginTop: "20px",
  color: colors.dark,
  fontWeight: "700",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "15px",
  borderRadius: "12px",
  border: `1px solid ${colors.pink}`,
  fontSize: "16px",
  outline: "none",
  background: "#FFFCFB",
  color: "#624957",
};

const mainButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px",
  marginTop: "25px",
  border: "none",
  borderRadius: "12px",
  background: colors.mauve,
  color: "#fff",
  fontSize: "17px",
  fontWeight: "700",
  cursor: "pointer",
};

const linkButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "#C77B87",
  fontWeight: "700",
  cursor: "pointer",
};

export default App;