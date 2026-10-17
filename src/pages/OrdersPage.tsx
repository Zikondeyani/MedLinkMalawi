import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useCustomerOrders } from "../lib/customerData";
import { useAuth } from "../lib/auth";
import { shortDate, mwk } from "../lib/format";
import { CustomerOrderStatusBadge } from "../components/marketplace/OrderStatus";
import OrderItemImage from "../components/marketplace/OrderItemImage";
import EmptyState from "../components/ui/EmptyState";

type Tab = "all" | "active" | "delivered";

export default function OrdersPage() {
  const { user } = useAuth();
  const customerOrders = useCustomerOrders(user?.email ?? "");
  const [tab, setTab] = useState<Tab>("all");

  const filtered = useMemo(() => {
    if (tab === "active") return customerOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
    if (tab === "delivered") return customerOrders.filter((o) => o.status === "delivered");
    return customerOrders;
  }, [tab, customerOrders]);

  return (
    <div className="page orders-page container">
      <div className="page-head">
        <span className="eyebrow">Your orders</span>
        <h1 className="h-display" style={{ fontSize: "clamp(24px,4vw,34px)" }}>Orders</h1>
        <p className="muted">Track deliveries, review invoices and reorder past items.</p>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab${tab === "all" ? " tab-active" : ""}`} onClick={() => setTab("all")}>All</button>
        <button className={`tab${tab === "active" ? " tab-active" : ""}`} onClick={() => setTab("active")}>Active</button>
        <button className={`tab${tab === "delivered" ? " tab-active" : ""}`} onClick={() => setTab("delivered")}>Delivered</button>
      </div>

      <div className="stack" style={{ marginTop: 24 }}>
        {filtered.length === 0 && (
          <EmptyState
            icon="box"
            title="No orders yet"
            message="Your completed and active orders will appear here."
            action={<Link to="/products" className="btn btn-primary">Browse Products</Link>}
          />
        )}
        {filtered.map((o) => (
          <Link to={`/orders/${o.id}`} key={o.id} className="card card-hover order-card">
            <div className="order-card-main">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <b className="small">{o.number}</b>
                  <CustomerOrderStatusBadge status={o.status} />
                </div>
                <div className="xs muted" style={{ marginTop: 4 }}>
                  Placed {shortDate(o.placedAt)} · {o.lines.reduce((a, l) => a + l.quantity, 0)} items
                </div>
              </div>
              <div className="order-card-art">
                {o.lines.slice(0, 3).map((l, i) => (
                  <OrderItemImage
                    key={`${l.productId}-${i}`}
                    image={l.image}
                    name={l.name}
                    className="order-art-thumb"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? 0 : -18 }}
                  />
                ))}
              </div>
            </div>
            <div className="order-card-side">
              <div className="between" style={{ gap: 16 }}>
                <span className="muted small">{o.status === "delivered" ? "Delivered" : "Est. delivery"}</span>
                <b>{o.status === "delivered" ? shortDate(o.placedAt) : o.estimatedDelivery || "To be confirmed"}</b>
              </div>
              <div className="between" style={{ gap: 16 }}>
                <span className="muted small">Total</span>
                <b>{mwk(o.total)}</b>
              </div>
              <ChevronRight size={17} className="muted" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}