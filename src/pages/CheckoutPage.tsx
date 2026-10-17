import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  Package,
  Smartphone,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { DeliveryAddress, PaymentMethod } from "../data/types";
import { mwk } from "../lib/format";
import { useCart, type CartSummary } from "../lib/cart";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { getDefaultCustomerAddress, placeCustomerOrder, saveCustomerAddress } from "../lib/customerData";
import { getPricing, loadMarketplace } from "../lib/registry";
import { quoteDelivery, serviceFee } from "../components/marketplace/DeliveryFeeCard";
import CheckoutSummary from "../components/marketplace/CheckoutSummary";
import ProductImage from "../components/ui/ProductImage";
import { SupplierAvatar } from "../components/marketplace/SupplierCard";
import { getSupplierById } from "../lib/registry";
import {
  cardCvc,
  cardExpiry,
  cardNumber,
  collect,
  mobileMoney,
  ok,
  required,
  requiredMin,
  validPhone,
  type FieldErrors,
  type Rule,
} from "../lib/validate";
import { ErrorSummary, FieldError, invalidProps } from "../components/ui/FieldError";

const steps = ["Delivery", "Delivery Fee", "Payment", "Review"] as const;
type Step = (typeof steps)[number];

interface PaymentFields {
  method: PaymentMethod;
  mobileNumber: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  bankRef: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function safePaymentReference(payment: PaymentFields): string {
  if (payment.method === "Mobile Money") {
    const digits = onlyDigits(payment.mobileNumber);
    return `Mobile Money · xx${digits.slice(-4) || "0000"}`;
  }
  if (payment.method === "Bank Card") {
    const digits = onlyDigits(payment.cardNumber);
    return `Bank Card · xx${digits.slice(-4) || "0000"}`;
  }
  return "Bank Transfer · reference submitted";
}

export default function CheckoutPage() {
  const { summary, clear } = useCart();
  const { push } = useToast();
  const { user } = useAuth();
  const customerEmail = user?.email ?? "";

  const [step, setStep] = useState<Step>("Delivery");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placed, setPlaced] = useState<CartSummary | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState("");
  const [placedOrderNumber, setPlacedOrderNumber] = useState("");

  const [address, setAddress] = useState<DeliveryAddress>(() => {
    const saved = customerEmail ? getDefaultCustomerAddress(customerEmail) : undefined;
    return {
      fullName: saved?.fullName ?? user?.name ?? "",
      phone: saved?.phone ?? "",
      address: saved?.address ?? "",
      city: saved?.city ?? "Lilongwe",
      area: saved?.area ?? "",
      instructions: saved?.instructions ?? "",
    };
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const [payment, setPayment] = useState<PaymentFields>({
    method: "Mobile Money",
    mobileNumber: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    bankRef: "",
  });
  // Per-field, not one form-level sentence: "Enter a valid card number" used
  // to appear above the three card boxes without saying which one was wrong.
  const [paymentErrors, setPaymentErrors] = useState<FieldErrors>({});

  // The estimate is whatever the stores in this cart promise, so pass their ids.
  const cartSupplierIds = useMemo(() => summary.groups.map((g) => g.supplierId), [summary.groups]);
  const delivery = useMemo(() => quoteDelivery(address.city, cartSupplierIds), [address.city, cartSupplierIds]);
  const fee = serviceFee(summary.subtotal);
  const ratePct = Math.round(getPricing().serviceFeeRate * 100);
  const total = summary.subtotal + fee + delivery.baseFee;
  const stepIndex = steps.indexOf(step);

  const validateAddress = (): boolean => {
    const next = collect(
      {
        fullName: address.fullName,
        phone: address.phone,
        address: address.address,
        city: address.city,
        area: address.area,
      },
      {
        fullName: [requiredMin("Full name", 2)],
        phone: [validPhone()],
        address: [required("Delivery address")],
        city: [required("City")],
        area: [required("Area / Zone")],
      },
    );
    setErrors(next);
    return ok(next);
  };

  /** Only the fields the chosen method actually collects. */
  const validatePayment = (): boolean => {
    const values: Record<string, string> = {};
    const rules: Record<string, Rule[]> = {};
    if (payment.method === "Mobile Money") {
      values.mobileNumber = payment.mobileNumber;
      rules.mobileNumber = [required("Mobile Money number"), mobileMoney()];
    } else if (payment.method === "Bank Card") {
      values.cardNumber = payment.cardNumber;
      values.cardExpiry = payment.cardExpiry;
      values.cardCvc = payment.cardCvc;
      rules.cardNumber = [cardNumber()];
      rules.cardExpiry = [cardExpiry()];
      rules.cardCvc = [cardCvc()];
    } else {
      values.bankRef = payment.bankRef;
      rules.bankRef = [requiredMin("Account name or reference", 3)];
    }
    const next = collect(values, rules);
    setPaymentErrors(next);
    return ok(next);
  };

  const next = () => {
    if (step === "Delivery" && !validateAddress()) return;
    if (step === "Payment" && !validatePayment()) return;
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const [placing, setPlacing] = useState(false);
  /** The estimate that was actually sent with the order, kept for the receipt. */
  const [placedEstimate, setPlacedEstimate] = useState("");

  /**
   * Place the order for real: the server re-prices every line from the
   * products table, checks stock, writes the order, the per-store fulfilment
   * rows, the payment and the notification in one transaction. The browser
   * only says which products and how many.
   */
  const placeOrder = async () => {
    if (!user || user.role !== "customer" || placing) return;
    if (!validatePayment()) return;

    setPlacing(true);
    const result = await placeCustomerOrder({
      lines: summary.groups.flatMap((group) =>
        group.lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      ),
      address,
      payment: { method: payment.method, reference: safePaymentReference(payment) },
      estimatedDelivery: delivery.estimated,
    });

    if (!result.ok) {
      setPlacing(false);
      push({ title: "Order not placed", message: result.error, icon: "error" });
      return;
    }

    // Remember where it was going, then re-read the marketplace so the order
    // list, the store queues and the notifications all show the new order.
    void saveCustomerAddress(user.email, address);
    void loadMarketplace();

    setPlaced(summary);
    setPlacedOrderId(result.order.id);
    setPlacedOrderNumber(result.order.number);
    setPlacedEstimate(result.order.estimatedDelivery ?? delivery.estimated);
    setOrderPlaced(true);
    setPlacing(false);
    clear();
    push({
      title: "Order placed",
      message: `Your order ${result.order.number} has been successfully placed.`,
      icon: "order",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (summary.items === 0 && !orderPlaced) {
    return (
      <div className="container page">
        <div className="empty">
          <div className="empty-icon"><Package size={28} strokeWidth={1.7} /></div>
          <h3>Your cart is empty</h3>
          <p>Add some products before heading to checkout.</p>
          <Link to="/products" className="btn btn-primary">Browse Products</Link>
        </div>
      </div>
    );
  }

  if (orderPlaced) {
    const placedSummary = placed ?? summary;
    const suppliers = placedSummary.groups.map((g) => getSupplierById(g.supplierId)?.name ?? g.supplierName);
    return (
      <div className="container page checkout-success">
        <div className="card card-pad success-card">
          <span className="success-icon"><CheckCircle2 size={44} strokeWidth={1.6} /></span>
          <h1 className="h-section">Order Confirmed</h1>
          <p className="muted" style={{ maxWidth: 480 }}>
            Your order <b>{placedOrderNumber}</b> has been successfully placed. The supplier has been notified and MedLink will handle delivery.
          </p>
          <div className="success-grid">
            <div className="success-item"><small className="muted">Supplier</small><b>{suppliers.join(", ")}</b></div>
            <div className="success-item"><small className="muted">Products</small><b>{placedSummary.items} items</b></div>
            <div className="success-item"><small className="muted">Delivery</small><b>MedLink Delivery</b></div>
            <div className="success-item"><small className="muted">Estimated delivery</small><b>{placedEstimate || "To be confirmed"}</b></div>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <Link to={`/orders/${placedOrderId}`} className="btn btn-primary"><Truck size={16} /> Track order</Link>
            <Link to="/products" className="btn btn-outline">Continue shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page checkout-page container">
      <div className="page-head">
        <span className="eyebrow">Secure checkout</span>
        <h1 className="h-display" style={{ fontSize: "clamp(24px,4vw,34px)" }}>Checkout</h1>
        <p className="muted">Pay once through MedLink. We collect from suppliers and deliver to your door.</p>
      </div>

      {/* Stepper */}
      <ol className="stepper">
        {steps.map((s, i) => (
          <li key={s} className={`stepper-step${i <= stepIndex ? " active" : ""}${i === stepIndex ? " current" : ""}`}>
            <span className="stepper-dot">{i < stepIndex ? <CheckCircle2 size={15} /> : i + 1}</span>
            <b>{s}</b>
            {i < steps.length - 1 && <span className="stepper-line" />}
          </li>
        ))}
      </ol>

      <div className="split checkout-layout">
        <div className="stack">
          {/* ---- Step 1: Delivery ---- */}
          {step === "Delivery" && (
            <div className="card card-pad">
              <div className="between" style={{ marginBottom: 18 }}>
                <h2 className="h-card row" style={{ gap: 8 }}>
                  <Truck size={18} className="teal" /> Delivery information
                </h2>
                <span className="badge badge-teal">Delivery by MedLink</span>
              </div>
              <ErrorSummary
                errors={errors}
                order={["Full name", "Phone number", "Delivery address", "City", "Area / Zone"]}
              />
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="fullName">Full name</label>
                  <input id="fullName" value={address.fullName} onChange={(e) => setAddress({ ...address, fullName: e.target.value })} {...invalidProps(errors, "fullName", "input")} />
                  <FieldError error={errors.fullName} field="fullName" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="phone">Phone number</label>
                  <input id="phone" placeholder="+265 ..." value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} {...invalidProps(errors, "phone", "input")} />
                  <FieldError error={errors.phone} field="phone" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="address">Delivery address</label>
                  <input id="address" placeholder="Street / plot / house number" value={address.address} onChange={(e) => setAddress({ ...address, address: e.target.value })} {...invalidProps(errors, "address", "input")} />
                  <FieldError error={errors.address} field="address" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="city">City</label>
                  <select id="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} {...invalidProps(errors, "city", "select")}>
                    <option>Lilongwe</option>
                    <option>Blantyre</option>
                    <option>Mzuzu</option>
                    <option>Zomba</option>
                  </select>
                  <FieldError error={errors.city} field="city" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="area">Area / Zone</label>
                  <input id="area" placeholder="e.g. Area 9, Chichiri" value={address.area} onChange={(e) => setAddress({ ...address, area: e.target.value })} {...invalidProps(errors, "area", "input")} />
                  <FieldError error={errors.area} field="area" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="instructions">Additional delivery instructions <span>(optional)</span></label>
                  <textarea id="instructions" className="textarea" value={address.instructions} onChange={(e) => setAddress({ ...address, instructions: e.target.value })} placeholder="e.g. Call ahead, deliver to reception..." />
                </div>
              </div>
            </div>
          )}

          {/* ---- Step 2: Delivery fee ---- */}
          {step === "Delivery Fee" && (
            <div className="card card-pad">
              <div className="between" style={{ marginBottom: 14 }}>
                <h2 className="h-card row" style={{ gap: 8 }}>
                  <Truck size={18} className="teal" /> Delivery fee
                </h2>
              </div>
              <div className="summary-row"><span>Delivery to</span><b>{address.area}, {address.city}</b></div>
              <div className="summary-row"><span>Order subtotal</span><b>{mwk(summary.subtotal)}</b></div>
              <div className="summary-row"><span>MedLink service fee ({ratePct}%)</span><b>{mwk(fee)}</b></div>
              <div className="summary-row"><span>MedLink delivery</span><b>{mwk(delivery.baseFee)}</b></div>
              <div className="summary-row summary-total"><span>Total</span><b>{mwk(total)}</b></div>
              <div className="delivery-note">
                <Truck size={17} />
                <p className="small muted">
                  Your order value is paid to the supplier. MedLink charges a <strong>{ratePct}% service fee</strong> on top of
                  your order, plus a delivery fee based on your delivery location. MedLink delivers every order — no
                  free delivery thresholds.
                </p>
              </div>
              <div className="delivery-who">
                <span><Package size={13} /> Supplier prepares</span>
                <span className="delivery-who-arrow">→</span>
                <span><Truck size={13} /> MedLink collects & delivers</span>
                <span className="delivery-who-arrow">→</span>
                <span>You receive</span>
              </div>
            </div>
          )}

          {/* ---- Step 3: Payment ---- */}
          {step === "Payment" && (
            <div className="card card-pad">
              <h2 className="h-card" style={{ marginBottom: 16 }}>Payment method</h2>
              <p className="small muted" style={{ marginBottom: 16 }}>
                Payments are processed by MedLink. The supplier receives payment for their products and MedLink delivers
                your order. This is a simulated checkout — no real payment is taken.
              </p>
              <ErrorSummary
                errors={paymentErrors}
                order={
                  payment.method === "Mobile Money"
                    ? ["Mobile Money number"]
                    : payment.method === "Bank Card"
                      ? ["Card number", "Expiry", "CVC"]
                      : ["Account name or reference"]
                }
              />
              <div className="pay-methods">
                <button className={`pay-method${payment.method === "Mobile Money" ? " pay-method-active" : ""}`} onClick={() => { setPaymentErrors({}); setPayment({ ...payment, method: "Mobile Money" }); }}>
                  <Smartphone size={20} />
                  <div className="grow"><b>Mobile Money</b><small>Airtel Money · TNM Mpamba</small></div>
                  <span className="pill-check">{payment.method === "Mobile Money" && "✓"}</span>
                </button>
                <button className={`pay-method${payment.method === "Bank Card" ? " pay-method-active" : ""}`} onClick={() => { setPaymentErrors({}); setPayment({ ...payment, method: "Bank Card" }); }}>
                  <CreditCard size={20} />
                  <div className="grow"><b>Bank Card</b><small>Visa · Mastercard</small></div>
                  <span className="pill-check">{payment.method === "Bank Card" && "✓"}</span>
                </button>
                <button className={`pay-method${payment.method === "Bank Transfer" ? " pay-method-active" : ""}`} onClick={() => { setPaymentErrors({}); setPayment({ ...payment, method: "Bank Transfer" }); }}>
                  <Landmark size={20} />
                  <div className="grow"><b>Bank Transfer</b><small>National Bank · Standard Bank · FDH</small></div>
                  <span className="pill-check">{payment.method === "Bank Transfer" && "✓"}</span>
                </button>
              </div>

              {payment.method === "Mobile Money" && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label className="label" htmlFor="momnum">Mobile Money number</label>
                  <input id="momnum" placeholder="+265 999 000 000" value={payment.mobileNumber} onChange={(e) => setPayment({ ...payment, mobileNumber: e.target.value })} {...invalidProps(paymentErrors, "mobileNumber", "input")} />
                  <FieldError error={paymentErrors.mobileNumber} field="momnum" />
                </div>
              )}
              {payment.method === "Bank Card" && (
                <div className="form-grid" style={{ marginTop: 16 }}>
                  <div className="field full">
                    <label className="label" htmlFor="cardnum">Card number</label>
                    <input id="cardnum" placeholder="4242 4242 4242 4242" value={payment.cardNumber} onChange={(e) => setPayment({ ...payment, cardNumber: e.target.value })} {...invalidProps(paymentErrors, "cardNumber", "input")} />
                    <FieldError error={paymentErrors.cardNumber} field="cardnum" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="exp">Expiry</label>
                    <input id="exp" placeholder="MM / YY" value={payment.cardExpiry} onChange={(e) => setPayment({ ...payment, cardExpiry: e.target.value })} {...invalidProps(paymentErrors, "cardExpiry", "input")} />
                    <FieldError error={paymentErrors.cardExpiry} field="exp" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cvc">CVC</label>
                    <input id="cvc" placeholder="123" value={payment.cardCvc} onChange={(e) => setPayment({ ...payment, cardCvc: e.target.value })} {...invalidProps(paymentErrors, "cardCvc", "input")} />
                    <FieldError error={paymentErrors.cardCvc} field="cvc" />
                  </div>
                </div>
              )}
              {payment.method === "Bank Transfer" && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label className="label" htmlFor="bankref">Account name / reference</label>
                  <input id="bankref" placeholder="e.g. BandaCare Clinic" value={payment.bankRef} onChange={(e) => setPayment({ ...payment, bankRef: e.target.value })} {...invalidProps(paymentErrors, "bankRef", "input")} />
                  <FieldError error={paymentErrors.bankRef} field="bankref" />
                  <span className="xs muted">MedLink will share account details to complete the transfer.</span>
                </div>
              )}
            </div>
          )}

          {/* ---- Step 4: Review ---- */}
          {step === "Review" && (
            <div className="stack">
              <div className="card card-pad">
                <h2 className="h-card" style={{ marginBottom: 14 }}>Review your order</h2>
                {summary.groups.map((g) => {
                  const supplier = getSupplierById(g.supplierId);
                  return (
                    <div key={g.supplierId} className="review-group">
                      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                        {supplier && <SupplierAvatar supplier={supplier} size={26} />}
                        <b className="small">{g.supplierName || supplier?.name}</b>
                      </div>
                      <div className="stack-sm">
                        {g.lines.map(({ product, quantity }) => (
                          <div key={product.id} className="review-line">
                            <ProductImage productId={product.id} categoryId={product.categoryId} name={product.name} imageUrl={product.image ?? product.images[0]} height={52} className="review-line-img" />
                            <div className="grow">
                              <b className="small">{product.name}</b>
                              <div className="xs muted">{mwk(product.price)} × {quantity}</div>
                            </div>
                            <b className="small">{mwk(product.price * quantity)}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="card card-pad">
                <h2 className="h-card" style={{ marginBottom: 12 }}>Delivery & payment</h2>
                <div className="summary-row"><span>Deliver to</span><b>{address.area}, {address.city}</b></div>
                <div className="summary-row"><span>Address</span><b className="small">{address.address}</b></div>
                <div className="summary-row"><span>Recipient</span><b>{address.fullName} · {address.phone}</b></div>
                <div className="summary-row"><span>Payment</span><b>{payment.method}</b></div>
                <div className="summary-row"><span>Delivery</span><b>MedLink</b></div>
                <div className="summary-row"><span>Service fee ({ratePct}%)</span><b>{mwk(fee)}</b></div>
                <div className="summary-row"><span>Delivery fee</span><b>{mwk(delivery.baseFee)}</b></div>
              </div>
            </div>
          )}

          {/* Primary action — full width of the column so it matches the cards */}
          <div className="checkout-nav">
            {step !== "Review" ? (
              <button className="btn btn-primary btn-lg" onClick={next}>
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn btn-green btn-lg" onClick={() => void placeOrder()} disabled={placing}>
                {placing ? <Loader2 size={17} className="spin" /> : <Banknote size={17} />}
                {placing ? "Placing order…" : `Place Order — ${mwk(total)}`}
              </button>
            )}
          </div>
        </div>

        {/* Summary sidebar */}
        <aside className="checkout-aside">
          <CheckoutSummary subtotal={summary.subtotal} serviceFee={fee} deliveryFee={delivery.baseFee} total={total} note="" />
          <div className="card card-pad secure-note">
            <span className="success-icon" style={{ width: 40, height: 40 }}><CheckCircle2 size={20} /></span>
            <p className="xs muted">
              <b className="ink">Marketplace payment.</b> You pay MedLink at checkout. The supplier receives their
              payment, and MedLink delivers your order to your door.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}