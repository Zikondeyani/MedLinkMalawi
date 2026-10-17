import {
  ArrowLeft,
  CalendarClock,
  MapPin,
  Package,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useOrders } from "../../lib/customerData";
import type { CustomerOrderStatus } from "../../data/types";
import { CustomerOrderStatusBadge } from "../../components/marketplace/OrderStatus";
import OrderTimeline from "../../components/marketplace/OrderTimeline";
import EmptyState from "../../components/ui/EmptyState";
import { mwk, prettyDate } from "../../lib/format";
import { setOrderStatus, useOrderStatuses } from "../../lib/registry";
import { useToast } from "../../lib/toast";

function availableStatuses(status: CustomerOrderStatus): CustomerOrderStatus[] {
  if (status === "confirmed" || status === "preparing") return [status, "cancelled"];
  if (status === "ready") return [status, "out_for_delivery", "cancelled"];
  if (status === "out_for_delivery") return [status, "delivered", "cancelled"];
  return [status];
}

export default function AdminOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const customerOrders = useOrders();
  const overrides = useOrderStatuses();
  const { push } = useToast();
  const order = customerOrders.find((candidate) => candidate.id === id);

  /** The server owns the status; a rejected change says so and the row keeps its stored value. */
  async function changeStatus(status: CustomerOrderStatus): Promise<void> {
    if (!order) return;
    const result = await setOrderStatus(order.id, status);
    push(
      result.ok
        ? { title: "Status updated", message: `${order.number} is now ${status.replace(/_/g, " ")}.`, icon: "success" }
        : { title: "Status not changed", message: result.error ?? "The server rejected the change.", icon: "error" },
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon="search"
        title="Order not found"
        message="This order does not exist or is no longer available."
        action={<Link to="/admin/orders" className="btn btn-primary">Back to orders</Link>}
      />
    );
  }

  const status = overrides[order.id] ?? order.status;

  return (
    <div className="stack dash-page">
      <Link to="/admin/orders" className="row muted small" style={{ gap: 6, width: "fit-content" }}>
        <ArrowLeft size={14} /> Back to orders
      </Link>

      <div className="card card-pad order-head">
        <div className="between wrap" style={{ gap: 14 }}>
          <div>
            <span className="eyebrow">Administrative order record</span>
            <h1 className="h-section" style={{ marginTop: 4 }}>{order.number}</h1>
            <p className="small muted">
              Placed {prettyDate(order.placedAt)} · {order.payment.method} · {order.payment.reference}
            </p>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <CustomerOrderStatusBadge status={status} />
            <select
              className="select select-sm"
              value={status}
              aria-label={`Change status for ${order.number}`}
              onChange={(event) => void changeStatus(event.target.value as CustomerOrderStatus)}
            >
              {availableStatuses(status).map((option) => (
                <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="h-card row" style={{ gap: 8, marginBottom: 16 }}>
          <CalendarClock size={17} className="teal" /> Fulfilment timeline
        </h2>
        <OrderTimeline order={{ ...order, status }} />
      </div>

      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 14 }}>
              <Package size={17} className="teal" /> Items
            </h2>
            <div className="stack-sm">
              {order.lines.map((line, index) => (
                <div key={`${line.productId}-${index}`} className="review-line">
                  <span className="order-item-thumb"><Package size={16} /></span>
                  <div className="grow">
                    <b className="small">{line.name}</b>
                    <div className="xs muted">
                      {line.supplierName} · {line.quantity} × {mwk(line.price)}
                    </div>
                  </div>
                  <b className="small">{mwk(line.price * line.quantity)}</b>
                </div>
              ))}
            </div>
            <div className="divider-solid" style={{ margin: "14px 0" }} />
            <div className="between"><span className="muted small">Products subtotal</span><b className="small">{mwk(order.subtotal)}</b></div>
            <div className="between"><span className="muted small">Delivery fee</span><b className="small">{mwk(order.deliveryFee)}</b></div>
            <div className="between" style={{ marginTop: 8 }}><b>Order total</b><b>{mwk(order.total)}</b></div>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 12 }}>
              <User size={17} className="teal" /> Customer
            </h2>
            <b className="small">{order.customerName}</b>
            <p className="small muted">{order.address.fullName} · {order.address.phone}</p>
          </div>

          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 12 }}>
              <MapPin size={17} className="teal" /> Delivery address
            </h2>
            <p className="small">{order.address.address}</p>
            <p className="small muted">{order.address.area}, {order.address.city}</p>
            {order.address.instructions && <p className="xs muted" style={{ marginTop: 6 }}>{order.address.instructions}</p>}
          </div>

          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 12 }}>
              <Wallet size={17} className="teal" /> Payment & delivery
            </h2>
            <div className="summary-row"><span>Method</span><b className="small">{order.payment.method}</b></div>
            <div className="summary-row"><span>Reference</span><b className="small">{order.payment.reference}</b></div>
            <div className="summary-row"><span>Fulfilment</span><b className="small"><Truck size={13} /> MedLink delivery</b></div>
            <div className="summary-row"><span>Estimated delivery</span><b className="small">{order.estimatedDelivery}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
