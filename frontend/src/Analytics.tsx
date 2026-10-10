import { type CSSProperties } from "react";
import { useAnalyticsOverview } from "./useAnalyticsOverview";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const colors = {
  mauve: "#9A7787",
  pink: "#E4AFB0",
  light: "#FDF5F2",
  dark: "#624957",
  text: "#806F78",
};

const cardGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "18px",
  marginTop: "20px",
};

const chartGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: "18px",
  marginTop: "20px",
};

const chartColors = ["#9A7787", "#E4AFB0", "#C69DAA", "#806F78", "#FED7BF"];

export function Analytics() {
  const { data, error, lastUpdated } = useAnalyticsOverview();

  const sectionStyle: CSSProperties = {
    marginTop: "45px",
    paddingTop: "30px",
    borderTop: `1px solid ${colors.pink}`,
  };

  if (error && !data) {
    return (
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "30px", color: colors.dark }}>Store Analytics</h2>
        <p style={{ color: colors.text }}>{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "30px", color: colors.dark }}>Store Analytics</h2>
        <p style={{ color: colors.text }}>Loading analytics...</p>
      </section>
    );
  }

  const topCategory = data.category_breakdown[0];
  const categoryMix = data.category_breakdown.slice(0, 6);
  const otherCategoryCount = data.category_breakdown
    .slice(6)
    .reduce((total, category) => total + category.product_count, 0);
  if (otherCategoryCount > 0) {
    categoryMix.push({
      category: "Other categories",
      product_count: otherCategoryCount,
      avg_price: 0,
      avg_rating: null,
    });
  }
  const maxCount = Math.max(
    ...data.category_breakdown.map((category) => category.product_count),
    1
  );

  return (
    <section style={sectionStyle}>
      <h2 style={{ fontSize: "30px", color: colors.dark, marginBottom: "8px" }}>
        Store Analytics
      </h2>
      <p style={{ color: colors.text, marginTop: 0 }}>
        Live analytics from the product database
        {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ""}
      </p>
      {error && <p style={{ color: "#c62828" }}>{error} Showing the last available data.</p>}

      <div style={cardGrid}>
        <MetricCard
          icon="📦"
          title="Total Products"
          value={data.total_products.toLocaleString("en-IN")}
          detail={`Across ${data.total_categories} categories`}
        />
        <MetricCard
          icon="⭐"
          title="Average Rating"
          value={data.average_rating !== null ? data.average_rating.toFixed(2) : "—"}
          detail="Mean customer rating"
        />
        <MetricCard
          icon="🏷️"
          title="Average Discount"
          value={
            data.average_discount_pct !== null
              ? `${data.average_discount_pct.toFixed(1)}%`
              : "—"
          }
          detail="Price change vs. list price"
        />
        {topCategory && (
          <MetricCard
            icon="🔥"
            title="Largest Category"
            value={String(topCategory.product_count)}
            detail={topCategory.category}
          />
        )}
      </div>

      <div style={chartGrid}>
        <div
          style={{
            minWidth: 0,
            padding: "20px",
            background: "#fff",
            border: `1px solid ${colors.pink}`,
            borderRadius: "16px",
          }}
        >
          <h3 style={{ fontSize: "20px", color: colors.dark, marginTop: 0 }}>
            Products by Category
          </h3>
          {data.category_breakdown.length === 0 ? (
            <p style={{ color: colors.text }}>No category data available.</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(320, data.category_breakdown.length * 28)}
            >
              <BarChart
                data={data.category_breakdown}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={120}
                  tick={{ fill: colors.text, fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="product_count" name="Products" fill={colors.mauve} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div
          style={{
            minWidth: 0,
            padding: "20px",
            background: "#fff",
            border: `1px solid ${colors.pink}`,
            borderRadius: "16px",
          }}
        >
          <h3 style={{ fontSize: "20px", color: colors.dark, marginTop: 0 }}>
            Category Mix
          </h3>
          {data.category_breakdown.length === 0 ? (
            <p style={{ color: colors.text }}>No category data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={categoryMix}
                  dataKey="product_count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name, percent }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {categoryMix.map((category, index) => (
                    <Cell
                      key={category.category}
                      fill={chartColors[index % chartColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: "22px", color: colors.dark, marginTop: "32px" }}>
        Category Breakdown
      </h3>
      <div
        style={{
          padding: "20px 24px",
          background: "#fff",
          border: `1px solid ${colors.pink}`,
          borderRadius: "16px",
        }}
      >
        {data.category_breakdown.length === 0 ? (
          <p style={{ color: colors.text }}>No category data available.</p>
        ) : (
          data.category_breakdown.map((category) => (
            <div key={category.category} style={{ marginBottom: "14px", textAlign: "left" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  color: colors.dark,
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                <span>{category.category}</span>
                <span style={{ color: colors.text, fontWeight: 400 }}>
                  {category.product_count} products · avg ₹
                  {category.avg_price.toLocaleString("en-IN")}
                  {category.avg_rating !== null ? ` · ⭐ ${category.avg_rating}` : ""}
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  marginTop: "6px",
                  borderRadius: "6px",
                  background: colors.light,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(category.product_count / maxCount) * 100}%`,
                    borderRadius: "6px",
                    background: colors.mauve,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div style={cardGrid}>
        <AnalyticsList
          title="Biggest Price Drops"
          empty="No discount data available."
          items={data.top_discounts.map((product) => ({
            id: product.id,
            title: product.title,
            value: `${product.discount_pct.toFixed(0)}% off`,
          }))}
        />
        <AnalyticsList
          title="Trending Products"
          empty="No demand data available."
          items={data.trending.map((product) => ({
            id: product.id,
            title: product.title,
            value: `${product.bought_past_month.toLocaleString("en-IN")}+ bought`,
          }))}
        />
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      style={{
        padding: "22px",
        background: "#fff",
        border: `1px solid ${colors.pink}`,
        borderRadius: "16px",
      }}
    >
      <div style={{ fontSize: "28px" }}>{icon}</div>
      <p style={{ color: colors.mauve, fontWeight: 700, marginBottom: "8px" }}>{title}</p>
      <strong style={{ display: "block", color: colors.dark, fontSize: "30px" }}>{value}</strong>
      <p style={{ color: colors.text, marginBottom: 0 }}>{detail}</p>
    </div>
  );
}

function AnalyticsList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: number; title: string; value: string }[];
}) {
  return (
    <div>
      <h3 style={{ fontSize: "22px", color: colors.dark }}>{title}</h3>
      {items.length === 0 ? (
        <p style={{ color: colors.text }}>{empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                padding: "14px 18px",
                background: "#fff",
                border: `1px solid ${colors.pink}`,
                borderRadius: "12px",
                textAlign: "left",
              }}
            >
              <span style={{ color: colors.dark, fontWeight: 600 }}>
                {item.title.length > 80 ? `${item.title.slice(0, 80)}…` : item.title}
              </span>
              <strong style={{ color: colors.mauve, whiteSpace: "nowrap" }}>{item.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}