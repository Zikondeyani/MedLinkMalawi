import {
  useCategorySales,
  useMonthlyOrders,
  useMonthlySales,
  useSupplierDashboardStats,
  useTopProducts,
} from "../../lib/analytics";
import { useCurrentSupplierId } from "../../lib/registry";
import { mwk, mwkCompact } from "../../lib/format";
import { LineChart, BarChart, DonutChart } from "../../components/charts/Charts";
import DashboardCard from "../../components/ui/DashboardCard";
import { Wallet, ShoppingBag, TrendingUp, Percent } from "lucide-react";

export default function SupplierSalesPage() {
  // Every figure below is this store's own history, read from the database.
  const supplierId = useCurrentSupplierId() ?? undefined;
  const monthlySales = useMonthlySales(supplierId);
  const monthlyOrders = useMonthlyOrders(supplierId);
  const topProducts = useTopProducts(supplierId);
  const categorySales = useCategorySales(supplierId);
  const stats = useSupplierDashboardStats(supplierId);

  const total = monthlySales.reduce((a, d) => a + d.sales, 0);
  const orders = monthlyOrders.reduce((a, d) => a + d.orders, 0);
  const avg = orders === 0 ? 0 : Math.round(total / orders);

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Performance</span>
          <h1 className="h-section">Sales</h1>
          <p className="small muted">Revenue, orders and best sellers over the last 12 months.</p>
        </div>
      </div>

      <div className="grid grid-4 dash-grid">
        <DashboardCard icon={<Wallet size={19} />} label="Total revenue" value={mwk(total)} sub="Last 12 months" tone="teal" />
        <DashboardCard icon={<ShoppingBag size={19} />} label="Total orders" value={String(orders)} sub="Last 12 months" tone="navy" />
        <DashboardCard icon={<TrendingUp size={19} />} label="Avg. order value" value={mwk(avg)} sub="Per order" tone="green" />
        <DashboardCard icon={<Percent size={19} />} label="Fulfilment" value={`${stats.fulfilment}%`} sub="Orders completed" tone="amber" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 className="h-card">Sales over time</h3>
            <span className="xs muted">MWK per month</span>
          </div>
          <LineChart data={monthlySales.map((d) => ({ label: d.month, value: d.sales }))} />
        </div>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 className="h-card">Category mix</h3>
          </div>
          <DonutChart data={categorySales} size={176} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 className="h-card">Orders over time</h3>
          </div>
          <BarChart data={monthlyOrders.map((d) => ({ label: d.month, value: d.orders }))} format="plain" color="#FFB74D" />
        </div>
        <div className="card card-pad">
          <h3 className="h-card" style={{ marginBottom: 14 }}>Top selling products</h3>
          <div className="stack-sm">
            {topProducts.map((p, i) => (
              <div key={p.name} className="top-product">
                <span className="top-product-rank">{i + 1}</span>
                <div className="grow">
                  <div className="between small">
                    <b className="small">{p.name}</b>
                    <span className="muted">{mwk(p.revenue)}</span>
                  </div>
                  <div className="top-product-bar">
                    <i style={{ width: `${(p.units / topProducts[0].units) * 100}%`, background: "#FFB74D" }} />
                  </div>
                  <span className="xs muted">{p.units} units · avg {mwkCompact(Math.round(p.revenue / p.units))}/unit</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}