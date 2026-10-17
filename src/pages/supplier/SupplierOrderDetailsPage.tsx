import { ArrowLeft, Ban, Check, MapPin, PackageCheck, Phone, Truck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { cancelSupplierOrder, updateSupplierOrderStatus, useSupplierOrderById } from "../../lib/customerData";
import type { SupplierOrderStatus } from "../../data/types";
import { supplyOrderStatusSteps } from "../../lib/analytics";
import { mwk, shortDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { SupplierOrderStatusBadge } from "../../components/marketplace/OrderStatus";
import EmptyState from "../../components/ui/EmptyState";

const stageOrder: SupplierOrderStatus[] = ["new", "confirmed", "preparing", "ready", "completed"];

export default function SupplierOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const order = useSupplierOrderById(id);
  const { push } = useToast();

  if (!order) {
    return (
      <EmptyState
        icon="search"
        title="Order not found"
        message="This order may have been removed."
        action={<Link to="/supplier/orders" className="btn btn-primary">Back to orders</Link>}
      />
    );
  }

  const currentIdx = stageOrder.indexOf(order.status);

  const advance = async (to: SupplierOrderStatus) => {
    const result = await updateSupplierOrderStatus(order.id, to);
    if (!result.ok) {
      push({ title: "Could not update", message: result.error ?? "The status change was rejected.", icon: "error" });
      return;
    }
    if (to === "confirmed") push({ title: "Order accepted", message: `${order.number} confirmed. MedLink notified.`, icon: "success" });
    if (to === "ready") push({ title: "Marked as ready", message: `MedLink will collect ${order.number}.`, icon: "order" });
  };

  const cancelOrder = async () => {
    if (!window.confirm(`Cancel your items in ${order.number}? The customer will be notified and can request a refund of the item subtotal.`)) return;
    const result = await cancelSupplierOrder(order.id);
    if (!result.ok) {
      push({ title: "Could not cancel order", message: result.error ?? "The cancellation was rejected.", icon: "error" });
      return;
    }
    push({ title: "Store items cancelled", message: "The customer and MedLink have been notified about the refund.", icon: "success" });
  };

  return (
    <div className="stack">
      <Link to="/supplier/orders" className="link-muted xs row" style={{ gap: 6 }}>
        <ArrowLeft size={14} /> All orders
      </Link>

      <div className="card card-pad order-head">
        <div className="between wrap" style={{ gap: 14 }}>
          <div>
            <span className="eyebrow">Order details</span>
            <h1 className="h-section" style={{ fontSize: "clamp(20px,3vw,26px)" }}>{order.number}</h1>
            <p className="xs muted">Placed {shortDate(order.placedAt)} · {order.paymentMethod}</p>
          </div>
          <SupplierOrderStatusBadge status={order.status} />
        </div>
      </div>

      {order.status !== "cancelled" && (
      <>
      {/* Supplier status steps */}
      <div className="card card-pad">
        <h2 className="h-card" style={{ marginBottom: 18 }}>Fulfilment status</h2>
        <div className="supplier-steps">
          {supplyOrderStatusSteps.map((s, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div key={s.key} className={`sstep${current ? " current" : ""}${done ? " done" : ""}`}>
                <span className="sstep-dot">{done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <b>{s.label}</b>
                {i < supplyOrderStatusSteps.length - 1 && <span className="sstep-line" />}
              </div>
            );
          })}
        </div>
        <div className="row wrap" style={{ marginTop: 18 }}>
          {order.status === "new" && (
            <button className="btn btn-teal" onClick={() => advance("confirmed")}>
              <Check size={16} /> Accept Order
            </button>
          )}
          {order.status === "confirmed" && (
            <button className="btn btn-primary" onClick={() => advance("preparing")}>
              <PackageCheck size={16} /> Start Preparing
            </button>
          )}
          {order.status === "preparing" && (
            <button className="btn btn-primary" onClick={() => advance("ready")}>
              <PackageCheck size={16} /> Mark as Ready for Pickup
            </button>
          )}
          {order.status === "ready" && (
            <span className="badge badge-navy" style={{ fontSize: 13, padding: "8px 14px" }}>
              <Truck size={14} /> Awaiting MedLink collection
            </span>
          )}
          {["new", "confirmed", "preparing", "ready"].includes(order.status) && (
            <button className="btn btn-outline btn-sm" onClick={() => void cancelOrder()}>
              <Ban size={14} /> Cancel store items
            </button>
          )}
        </div>
      </div>
      </>
      )}

      {order.status === "cancelled" && (
        <div className="card card-pad">
          <h2 className="h-card">Store items cancelled</h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            The customer has been notified. Their refund request covers the item subtotal only; MedLink delivery and service fees are excluded.
          </p>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}>
        <div className="stack">
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 14 }}>{order.status === "cancelled" ? "Cancelled items" : "What to prepare"}</h2>
            <div className="stack-sm">
              {order.lines.map((l) => (
                <div key={l.productId + l.name} className="review-line">
                  <div className="order-item-thumb"><PackageCheck size={16} /></div>
                  <div className="grow">
                    <b className="small">{l.name}</b>
                    <div className="xs muted">{l.quantity} × {mwk(l.price)}</div>
                  </div>
                  <b className="small">{mwk(l.price * l.quantity)}</b>
                </div>
              ))}
            </div>
            <div className="divider-solid" style={{ margin: "14px 0" }} />
            <div className="between"><span className="muted small">Subtotal</span><b>{mwk(order.subtotal)}</b></div>
            <div className="between"><span className="muted small">MedLink delivery fee</span><b>{mwk(order.deliveryFee)}</b></div>
            <div className="between" style={{ marginTop: 8 }}><b>Total paid</b><b style={{ fontSize: 18 }}>{mwk(order.total)}</b></div>
          </div>

          {order.note && (
            <div className="card card-pad">
              <h2 className="h-card" style={{ marginBottom: 8 }}>Customer note</h2>
              <p className="small muted">“{order.note}”</p>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 12 }}>Who ordered</h2>
            <b className="small">{order.customerOrg}</b>
            <p className="small muted">{order.customerName}</p>
            <p className="small muted row" style={{ gap: 6, marginTop: 6 }}><Phone size={13} /> {order.customerPhone}</p>
            <p className="small muted row" style={{ gap: 6, marginTop: 2 }}><MapPin size={13} /> {order.city} · {order.area}</p>
          </div>
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 12 }}>Delivery</h2>
            <div className="delivery-who" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <span><b>You</b> — prepare the order</span>
              <span className="delivery-who-arrow">↓</span>
              <span><b>MedLink</b> — collects & delivers</span>
              <span className="delivery-who-arrow">↓</span>
              <span><b>{order.customerOrg}</b> — receives the order</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}