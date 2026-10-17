import { Check, Package, Truck, XCircle, Clock } from "lucide-react";
import type { CustomerOrderStatus, Order } from "../../data/types";
import { prettyDateTime } from "../../lib/format";

const steps: { key: CustomerOrderStatus; label: string; sub: string }[] = [
  { key: "confirmed", label: "Confirmed", sub: "Order accepted" },
  { key: "preparing", label: "Preparing Order", sub: "Supplier packing" },
  { key: "ready", label: "Ready for Pickup", sub: "MedLink collects" },
  { key: "out_for_delivery", label: "Out for Delivery", sub: "On the way" },
  { key: "delivered", label: "Delivered", sub: "Received" },
];

const orderFlow: {
  who: string;
  title: string;
  detail: string;
  icon: "package" | "truck" | "user";
}[] = [
  { who: "Supplier", title: "Prepares the order", detail: "Packs and labels your items for MedLink pickup.", icon: "package" },
  { who: "MedLink", title: "Collects and delivers", detail: "Our delivery team picks up from the supplier and delivers to your address.", icon: "truck" },
  { who: "Customer", title: "Receives the order", detail: "Confirm your items at the door and enjoy your delivery.", icon: "user" },
];

export function DeliveryFlow() {
  return (
    <div className="delivery-flow">
      {orderFlow.map((s, i) => (
        <div key={s.who} className="delivery-flow-step">
          <span className="delivery-flow-who">{s.who}</span>
          <span className="delivery-flow-title">
            {s.icon === "package" && <Package size={16} />}
            {s.icon === "truck" && <Truck size={16} />}
            {s.icon === "user" && <Clock size={16} />}
            {s.title}
          </span>
          <span className="delivery-flow-detail">{s.detail}</span>
          {i < orderFlow.length - 1 && <span className="delivery-flow-arrow">↓</span>}
        </div>
      ))}
    </div>
  );
}

export default function OrderTimeline({ order }: { order: Order }) {
  const activeIndex = steps.findIndex((s) => s.key === order.status);
  const cancelled = order.status === "cancelled";

  return (
    <div>
      {cancelled ? (
        <div className="badge badge-red">
          <XCircle size={14} /> Order cancelled
        </div>
      ) : (
        <>
          {/* Desktop horizontal */}
          <ol className="timeline timeline-h">
            {steps.map((s, i) => {
              const done = i < activeIndex;
              const current = i === activeIndex;
              return (
                <li key={s.key} className={`timeline-step${current ? " current" : ""}${done ? " done" : ""}`}>
                  <span className="timeline-dot">
                    {done ? <Check size={14} strokeWidth={3} /> : s.key === "out_for_delivery" && current ? <Truck size={14} /> : i + 1}
                  </span>
                  <b>{s.label}</b>
                  <small className="muted">{s.sub}</small>
                  {current && order.timeline.length > 0 && <small className="muted">{prettyDateTime(order.timeline[order.timeline.length - 1].at)}</small>}
                </li>
              );
            })}
          </ol>
          {/* Mobile vertical */}
          <ol className="timeline timeline-v">
            {steps.map((s, i) => {
              const done = i < activeIndex;
              const current = i === activeIndex;
              return (
                <li key={s.key} className={`timeline-vstep${current ? " current" : ""}${done ? " done" : ""}`}>
                  <span className="timeline-dot">
                    {done ? <Check size={14} strokeWidth={3} /> : current && s.key === "out_for_delivery" ? <Truck size={14} /> : i + 1}
                  </span>
                  <div>
                    <b>{s.label}</b>
                    <small className="muted">{s.sub}</small>
                  </div>
                  {current && order.timeline.length > 0 && <small className="muted timeline-vtime">{prettyDateTime(order.timeline[order.timeline.length - 1].at)}</small>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}