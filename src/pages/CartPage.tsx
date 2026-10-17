import { ShoppingCart, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getSupplierById } from "../lib/registry";
import { mwk } from "../lib/format";
import { useCart } from "../lib/cart";
import { useToast } from "../lib/toast";
import PriceDisplay from "../components/ui/PriceDisplay";
import ProductImage from "../components/ui/ProductImage";
import QuantitySelector from "../components/ui/QuantitySelector";
import CheckoutSummary from "../components/marketplace/CheckoutSummary";
import { serviceFee } from "../components/marketplace/DeliveryFeeCard";
import EmptyState from "../components/ui/EmptyState";
import { SupplierAvatar } from "../components/marketplace/SupplierCard";

export default function CartPage() {
  const { summary, setQuantity, remove } = useCart();
  const { push } = useToast();
  const navigate = useNavigate();

  if (summary.items === 0) {
    return (
      <div className="container page">
        <EmptyState
          title="Your cart is empty"
          message="Find the medical supplies you need from trusted suppliers."
          action={
            <Link to="/products" className="btn btn-primary">
              <ShoppingCart size={16} /> Browse Products
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page cart-page container">
      <div className="page-head">
        <span className="eyebrow">Your selection</span>
        <h1 className="h-display" style={{ fontSize: "clamp(24px,4vw,34px)" }}>Shopping Cart</h1>
        <p className="muted">Items are grouped by supplier. MedLink collects from each supplier and delivers in one trip.</p>
      </div>

      <div className="split cart-layout">
        <div className="stack">
          {summary.groups.map((group) => {
            const supplier = getSupplierById(group.supplierId);
            return (
              <div key={group.supplierId} className="card cart-group">
                <div className="cart-group-head">
                  {supplier && <SupplierAvatar supplier={supplier} size={34} />}
                  <div className="grow">
                    <Link to={`/suppliers/${supplier?.slug ?? ""}`} className="small bold">
                      {group.supplierName || supplier?.name}
                    </Link>
                    {supplier?.verified && <span className="pcard-check">✓</span>}
                    <div className="xs muted">
                      {supplier?.delivery.estimate ? `Delivery ${supplier.delivery.estimate} · ` : ""}
                      {group.lines.reduce((a, l) => a + l.quantity, 0)} items
                    </div>
                  </div>
                  <span className="badge badge-soft">MedLink collects</span>
                </div>

                <div className="cart-lines">
                  {group.lines.map(({ product, quantity }) => (
                    <div key={product.id} className="cart-line">
                      <Link to={`/products/${product.slug}`} className="cart-line-img">
                        <ProductImage productId={product.id} categoryId={product.categoryId} name={product.name} imageUrl={product.image ?? product.images[0]} height={76} />
                      </Link>
                      <div className="grow cart-line-info">
                        <Link to={`/products/${product.slug}`} className="small semibold">
                          {product.name}
                        </Link>
                        <div className="xs muted">
                          {product.brand} · {product.unit} @ <PriceDisplay price={product.price} size="sm" />
                        </div>
                        <div className="row" style={{ marginTop: 8 }}>
                          <QuantitySelector
                            value={quantity}
                            size="sm"
                            max={99}
                            onChange={(n) => {
                              setQuantity(product.id, n);
                              if (n > quantity) push({ title: "Quantity updated", message: `${product.name} × ${n}`, icon: "info" });
                            }}
                          />
                          <button
                            className="btn btn-ghost btn-icon cart-remove"
                            aria-label={`Remove ${product.name}`}
                            onClick={() => {
                              remove(product.id);
                              push({ title: "Removed from cart", message: product.name, icon: "info" });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="cart-line-sub">
                        <b>{mwk(product.price * quantity)}</b>
                        <small className="muted">{mwk(product.price)} each</small>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-group-foot">
                  <span className="muted small">Group subtotal</span>
                  <b>{mwk(group.subtotal)}</b>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="cart-aside">
          <CheckoutSummary subtotal={summary.subtotal} serviceFee={serviceFee(summary.subtotal)} />
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} onClick={() => navigate("/checkout")}>
            Proceed to Checkout →
          </button>
          <Link to="/products" className="btn btn-ghost btn-block" style={{ marginTop: 4 }}>
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}