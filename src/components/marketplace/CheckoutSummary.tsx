import { HandCoins, Truck } from "lucide-react";
import { mwk } from "../../lib/format";
import { getPricing } from "../../lib/registry";

export default function CheckoutSummary({
  subtotal,
  serviceFee,
  deliveryFee,
  total,
  note = "Delivery calculated at checkout",
}: {
  subtotal: number;
  serviceFee?: number;
  deliveryFee?: number;
  total?: number;
  note?: string;
}) {
  const ratePct = Math.round(getPricing().serviceFeeRate * 100);
  return (
    <div className="card checkout-summary">
      <h3 className="h-card" style={{ marginBottom: 14 }}>
        Order summary
      </h3>
      <div className="summary-row">
        <span>Subtotal</span>
        <b>{mwk(subtotal)}</b>
      </div>
      {serviceFee != null && (
        <div className="summary-row">
          <span className="row" style={{ gap: 7 }}>
            <HandCoins size={15} className="muted" /> MedLink service fee ({ratePct}%)
          </span>
          <b>{mwk(serviceFee)}</b>
        </div>
      )}
      <div className="summary-row">
        <span className="row" style={{ gap: 7 }}>
          <Truck size={15} className="muted" /> MedLink delivery
        </span>
        {deliveryFee != null ? (
          <b>{mwk(deliveryFee)}</b>
        ) : (
          <em className="xs muted">{note}</em>
        )}
      </div>
      {deliveryFee != null && total != null && (
        <>
          <div className="divider" style={{ margin: "14px 0" }} />
          <div className="summary-row summary-total">
            <span>Total</span>
            <b>{mwk(total)}</b>
          </div>
        </>
      )}
      <p className="xs muted checkout-summary-note" style={{ marginTop: 12 }}>
        MedLink handles collection and delivery. Service and delivery fees are shown above.
      </p>
    </div>
  );
}