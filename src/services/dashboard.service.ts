import pool from "../config/db.js";


export interface SalesSummary {
  total_revenue_cents: number;
  total_orders: number;
  total_products: number;
  pending_payout_cents: number;
}

export interface TopProduct {
  product_id: string;
  title: string;
  thumbnail: string | null;
  total_sales: number;
  total_revenue_cents: number;
}

export interface RecentOrder {
  order_id: string;
  product_title: string;
  buyer_name: string;
  buyer_email: string;
  amount_cents: number;
  ordered_at: Date;
}

export interface RevenuePoint {
  date: string;
  revenue_cents: number;
  orders: number;
}

export interface DashboardData {
  summary: SalesSummary;
  top_products: TopProduct[];
  recent_orders: RecentOrder[];
  revenue_chart: RevenuePoint[];
}



export const getCreatorDashboard = async (
  creatorId: string,
  period: "7d" | "30d" | "90d" = "30d"
): Promise<DashboardData> => {
  const periodDays = { "7d": 7, "30d": 30, "90d": 90 }[period];


  const { rows: [summary] } = await pool.query<{
    total_revenue: string;
    total_orders: string;
  }>(
    `SELECT
       COALESCE(SUM(o.amount_cents), 0) AS total_revenue,
       COUNT(o.id) AS total_orders
     FROM orders o
     JOIN products p ON o.product_id = p.id
     WHERE p.creator_id = $1 AND o.status = 'paid'`,
    [creatorId]
  );

  const { rows: [productCount] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM products
     WHERE creator_id = $1 AND status != 'deleted'`,
    [creatorId]
  );

  const { rows: [pendingPayout] } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
     FROM payouts
     WHERE creator_id = $1 AND status = 'pending'`,
    [creatorId]
  );

  // ── Top products ───────────────────────────────────────────────────────────
  const { rows: topProducts } = await pool.query<TopProduct>(
    `SELECT
       p.id AS product_id,
       p.title,
       p.thumbnail,
       COUNT(o.id)::int AS total_sales,
       COALESCE(SUM(o.amount_cents), 0)::int AS total_revenue_cents
     FROM products p
     LEFT JOIN orders o ON o.product_id = p.id AND o.status = 'paid'
     WHERE p.creator_id = $1 AND p.status != 'deleted'
     GROUP BY p.id, p.title, p.thumbnail
     ORDER BY total_sales DESC
     LIMIT 5`,
    [creatorId]
  );

  // ── Recent orders ──────────────────────────────────────────────────────────
  const { rows: recentOrders } = await pool.query<RecentOrder>(
    `SELECT
       o.id AS order_id,
       p.title AS product_title,
       u.name AS buyer_name,
       u.email AS buyer_email,
       o.amount_cents,
       o.created_at AS ordered_at
     FROM orders o
     JOIN products p ON o.product_id = p.id
     JOIN users u ON o.buyer_id = u.id
     WHERE p.creator_id = $1 AND o.status = 'paid'
     ORDER BY o.created_at DESC
     LIMIT 10`,
    [creatorId]
  );

  // ── Revenue chart (daily breakdown) ───────────────────────────────────────
  const { rows: revenueChart } = await pool.query<RevenuePoint>(
    `SELECT
       TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date,
       COALESCE(SUM(o.amount_cents), 0)::int AS revenue_cents,
       COUNT(o.id)::int AS orders
     FROM orders o
     JOIN products p ON o.product_id = p.id
     WHERE p.creator_id = $1
       AND o.status = 'paid'
       AND o.created_at >= NOW() - INTERVAL '${periodDays} days'
     GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
     ORDER BY date ASC`,
    [creatorId]
  );

  return {
    summary: {
      total_revenue_cents: parseInt(summary?.total_revenue ?? "0", 10),
      total_orders: parseInt(summary?.total_orders ?? "0", 10),
      total_products: parseInt(productCount?.count ?? "0", 10),
      pending_payout_cents: parseInt(pendingPayout?.total ?? "0", 10),
    },
    top_products: topProducts,
    recent_orders: recentOrders,
    revenue_chart: revenueChart,
  };
};

// ── Buyer list + CSV export ────────────────────────────────────────────────────

export interface BuyerRow {
  buyer_id: string;
  name: string;
  email: string;
  total_purchases: number;
  total_spent_cents: number;
  last_purchase_at: Date;
}

export const getCreatorBuyers = async (
  creatorId: string
): Promise<BuyerRow[]> => {
  const { rows } = await pool.query<BuyerRow>(
    `SELECT
       u.id AS buyer_id,
       u.name,
       u.email,
       COUNT(o.id)::int AS total_purchases,
       COALESCE(SUM(o.amount_cents), 0)::int AS total_spent_cents,
       MAX(o.created_at) AS last_purchase_at
     FROM orders o
     JOIN users u ON o.buyer_id = u.id
     JOIN products p ON o.product_id = p.id
     WHERE p.creator_id = $1 AND o.status = 'paid'
     GROUP BY u.id, u.name, u.email
     ORDER BY last_purchase_at DESC`,
    [creatorId]
  );

  return rows;
};