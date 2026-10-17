import { ArrowLeft, CalendarClock, CheckCircle2, MapPin, Package, RotateCcw, Truck, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { confirmCustomerDelivery, useCustomerOrderById, useSupplierOrders } from "../lib/customerData";
import { useAuth } from "../lib/auth";
import { getSupplierById } from "../lib/registry";
import { prettyDate, prettyDateTime, mwk } from "../lib/format";
import { useCart } from "../lib/cart";
import { useToast } from "../lib/toast";
import OrderTimeline, { DeliveryFlow } from "../components/marketplace/OrderTimeline";
import { CustomerOrderStatusBadge, SupplierOrderStatusBadge } from "../components/marketplace/OrderStatus";
import OrderItemImage from "../components/marketplace/OrderItemImage";
import { SupplierAvatar } from "../components/marketplace/SupplierCard";
import EmptyState from "../components/ui/EmptyState";
import { useState } from "react";
import { selectRefundAccount, useOrderRefundRequests, useRefundAccounts } from "../lib/refunds";

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const order = useCustomerOrderById(id, user?.email ?? "");
  const supplierOrders = useSupplierOrders().filter((supplierOrder) => supplierOrder.orderId === id);
  const { requests: refundRequests, error: refundsError } = useOrderRefundRequests(id);
  const { accounts: refundAccounts } = useRefundAccounts(user?.id);
  const { add } = useCart();
  const { push } = useToast();
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [savingRefundId, setSavingRefundId] = useState<string | null>(null);

  if (!order) {
    return (
      <div className="container page">
        <EmptyState
          icon="search"
          title="Order not found"
          message="We couldn't find that order. Check the order number and try again."
          action={<Link to="/orders" className="btn btn-primary">Back to orders</Link>}
        />
      </div>
    );
  }

  const suppliers = [...new Set(order.lines.map((l) => l.supplierId))].map((sid) => getSupplierById(sid)).filter(Boolean);
  const cancelledSupplierIds = new Set(supplierOrders.filter((supplierOrder) => supplierOrder.status === "cancelled").map((supplierOrder) => supplierOrder.supplierId));

  const reorder = () => {
    order.lines.forEach((l) => add(l.productId, l.quantity));
    push({ title: "Items re-added", message: `${order.lines.reduce((a, l) => a + l.quantity, 0)} items added to your cart.`, icon: "cart" });
  };

  const confirmDelivery = async () => {
    setConfirmingDelivery(true);
    const result = await confirmCustomerDelivery(order.id);
    setConfirmingDelivery(false);
    if (!result.ok) {
      push({ title: "Could not confirm delivery", message: result.error, icon: "error" });
      return;
    }
    push({
      title: "Delivery confirmed",
      message: "The supplier and MedLink team have been notified.",
      icon: "success",
    });
  };

  return (
    <div className="page order-details container">
      <Link to="/orders" className="link-muted xs row" style={{ gap: 6, marginBottom: 16 }}>
        <ArrowLeft size={14} /> All orders
      </Link>

      <div className="card card-pad order-head">
        <div className="between wrap" style={{ gap: 14 }}>
          <div>
            <span className="eyebrow">Order tracking</span>
            <h1 className="h-section" style={{ marginTop: 4 }}>{order.number}</h1>
            <p className="xs muted">Placed {prettyDate(order.placedAt)} · {order.payment.method} · {order.payment.reference}</p>
          </div>
          <div className="row" style={{ flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <CustomerOrderStatusBadge status={order.status} />
            <button className="btn btn-outline btn-sm" onClick={reorder}>
              <RotateCcw size={14} /> Reorder items
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <OrderTimeline order={order} />
      </div>

      {order.status === "out_for_delivery" && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="between wrap" style={{ gap: 14 }}>
            <div>
              <h2 className="h-card row" style={{ gap: 8 }}>
                <CheckCircle2 size={17} className="teal" /> Have you received your order?
              </h2>
              <p className="small muted" style={{ marginTop: 6 }}>
                Confirm only after you have received the items. This updates the order for the supplier and MedLink.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void confirmDelivery()}
              disabled={confirmingDelivery}
            >
              <CheckCircle2 size={14} />
              {confirmingDelivery ? "Confirming..." : "Confirm delivery"}
            </button>
          </div>
        </div>
      )}

      <div className="split" style={{ marginTop: 20 }}>
        <div className="stack">
          {/* Items */}
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 14 }}>
              <Package size={17} className="teal" /> Items
            </h2>
            <div className="stack-sm">
              {order.lines.map((l, i) => (
                <div key={l.productId + i} className="review-line">
                  <OrderItemImage image={l.image} name={l.name} className="order-item-thumb" />
                  <div className="grow">
                    <div className="between">
                      <b className="small">{l.name}</b>
                      <b className="small">{mwk(l.price * l.quantity)}</b>
                    </div>
                    <div className="xs muted">
                      {l.supplierName} · {l.quantity} × {mwk(l.price)}
                    </div>
                    {cancelledSupplierIds.has(l.supplierId) && (
                      <span className="badge badge-red" style={{ marginTop: 6 }}>Cancelled by store</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {refundsError && <p className="small" role="alert" style={{ color: "var(--red, #b42318)", marginTop: 12 }}>{refundsError}</p>}
            {refundRequests.length > 0 && (
              <div className="stack-sm" style={{ marginTop: 16 }}>
                {refundRequests.map((refund) => {
                  const supplierOrder = supplierOrders.find((candidate) => candidate.id === refund.supplierOrderId);
                  const supplier = getSupplierById(refund.supplierId);
                  const selectedAccount = refundAccounts.find((account) => account.id === refund.refundAccountId);
                  return (
                    <div key={refund.id} className="card card-pad">
                      <div className="between wrap" style={{ gap: 10 }}>
                        <div>
                          <b className="small">Refund · {supplier?.name ?? "Store"}</b>
                          <p className="xs muted" style={{ marginTop: 3 }}>
                            {supplierOrder?.lines.map((line) => line.name).join(", ") ?? "Cancelled store items"}
                          </p>
                        </div>
                        <b>{mwk(refund.amount)}</b>
                      </div>
                      <p className="xs muted" style={{ marginTop: 8 }}>
                        Refund is for cancelled item value only. Delivery and service fees are not included.
                      </p>
                      {refund.status === "awaiting_account" ? (
                        <div className="stack-sm" style={{ marginTop: 10 }}>
                          <label className="label" htmlFor={`refund-account-${refund.id}`}>Choose a refund account</label>
                          {refundAccounts.length === 0 ? (
                            <Link to="/account/refunds" className="btn btn-outline btn-sm">Add a refund account</Link>
                          ) : (
                            <select
                              id={`refund-account-${refund.id}`}
                              className="input"
                              defaultValue=""
                              disabled={savingRefundId === refund.id}
                              onChange={async (event) => {
                                const accountId = event.target.value;
                                if (!accountId) return;
                                setSavingRefundId(refund.id);
                                const result = await selectRefundAccount(refund.id, accountId);
                                setSavingRefundId(null);
                                if (!result.ok) {
                                  push({ title: "Could not select account", message: result.error ?? "The account could not be saved.", icon: "error" });
                                  return;
                                }
                                push({ title: "Refund account selected", message: "MedLink can now process the item refund.", icon: "success" });
                              }}
                            >
                              <option value="">Select saved account</option>
                              {refundAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.label} · {account.provider} · {account.accountNumber}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                          <span className={`badge ${refund.status === "refunded" ? "badge-green" : refund.status === "processing" ? "badge-amber" : "badge-navy"}`}>
                            {refund.status === "pending" ? "Refund pending" : refund.status === "processing" ? "Refund processing" : "Refunded"}
                          </span>
                          {selectedAccount && <span className="xs muted">{selectedAccount.provider} · {selectedAccount.accountNumber}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="between" style={{ marginTop: 14 }}>
              <span className="muted small">Delivery fee (MedLink)</span>
              <b className="small">{mwk(order.deliveryFee)}</b>
            </div>
            <div className="divider-solid" style={{ margin: "12px 0" }} />
            <div className="between">
              <b>Order total</b>
              <b style={{ fontSize: 18 }}>{mwk(order.total)}</b>
            </div>
          </div>

          {/* Delivery flow */}
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 16 }}>
              <Truck size={17} className="teal" /> How your order travels
            </h2>
            <DeliveryFlow />
          </div>
        </div>

        <div className="stack">
          {/* Address */}
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 12 }}>
              <MapPin size={17} className="teal" /> Delivery address
            </h2>
            <p className="small"><b>{order.address.fullName}</b> · {order.address.phone}</p>
            <p className="small muted">{order.address.address}</p>
            <p className="small muted">{order.address.area}, {order.address.city}</p>
            {order.address.instructions && <p className="xs muted" style={{ marginTop: 6 }}>ℹ {order.address.instructions}</p>}
          </div>

          {/* Suppliers */}
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 12 }}>Suppliers</h2>
            <div className="stack-sm">
              {suppliers.map((s) => {
                if (!s) return null;
                const supplierOrder = supplierOrders.find((candidate) => candidate.supplierId === s.id);
                return (
                  <Link to={`/suppliers/${s.slug}`} key={s.id} className="review-line">
                    <SupplierAvatar supplier={s} size={34} />
                    <div className="grow">
                      <b className="small">{s.name}</b>
                      <div className="xs muted">{s.location.city} · Verified{s.verified ? " ✓" : ""}</div>
                    </div>
                    {supplierOrder && <SupplierOrderStatusBadge status={supplierOrder.status} />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Timeline rows */}
          <div className="card card-pad">
            <h2 className="h-card row" style={{ gap: 8, marginBottom: 12 }}>
              <CalendarClock size={17} className="teal" /> Key dates
            </h2>
            <div className="stack-sm">
              {order.timeline.map((t) => (
                <div key={t.status + t.at} className="between">
                  <span className="small row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: "#FFB74D" }} /> {t.status.replace(/_/g, " ")}
                  </span>
                  <span className="xs muted">{prettyDateTime(t.at)}</span>
                </div>
              ))}
              <div className="between">
                <span className="small row" style={{ gap: 8 }}><Wallet size={13} className="muted" /> Estimated delivery</span>
                <span className="small bold">{order.estimatedDelivery}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}