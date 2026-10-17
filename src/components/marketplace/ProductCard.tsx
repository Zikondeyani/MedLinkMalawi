import { Heart, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { getSupplierById } from "../../lib/registry";
import type { Product } from "../../data/types";
import { useCart } from "../../lib/cart";
import { useToast } from "../../lib/toast";
import { useWishlist } from "../../lib/wishlist";
import PriceDisplay from "../ui/PriceDisplay";
import ProductImage from "../ui/ProductImage";

export function StockStatus({ stock, unit = "unit" }: { stock: number; unit?: string }) {
  if (stock <= 0)
    return (
      <span className="stock stock-out">
        <span className="dot stock-dot-red" /> Out of stock
      </span>
    );
  if (stock < 10)
    return (
      <span className="stock stock-low">
        <span className="dot stock-dot-amber" /> Low stock · {stock} {unit} left
      </span>
    );
  return (
    <span className="stock stock-in">
      <span className="dot stock-dot-green" /> In stock
    </span>
  );
}

export default function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const supplier = getSupplierById(product.supplierId);
  const { add } = useCart();
  const { push } = useToast();
  const { has, toggle } = useWishlist();
  const wished = has(product.id);

  return (
    <article className={`card card-hover pcard${compact ? " pcard-compact" : ""}`}>
      <div className="pcard-img-wrap">
        <Link to={`/products/${product.slug}`} aria-label={product.name}>
          <ProductImage productId={product.id} categoryId={product.categoryId} name={product.name} imageUrl={product.image ?? product.images[0]} className="pcard-img" />
        </Link>
        {product.isNew && <span className="pcard-flag">New</span>}
        <button
          className={`btn btn-icon wish-btn${wished ? " wished" : ""}`}
          aria-label={wished ? "Remove from saved" : "Save product"}
          onClick={(e) => {
            e.preventDefault();
            toggle(product.id);
            push({
              title: wished ? "Removed from saved" : "Saved to wishlist",
              message: product.name,
              icon: "info",
            });
          }}
        >
          <Heart size={17} fill={wished ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="pcard-body">
        <Link to={`/products/${product.slug}`} className="pcard-name">
          {product.name}
        </Link>
        {supplier && (
          <Link to={`/suppliers/${supplier.slug}`} className="pcard-supplier">
            {supplier.name}
            {supplier.verified && <span className="pcard-check">✓</span>}
          </Link>
        )}
        <div className="between pcard-foot">
          <PriceDisplay price={product.price} unit={product.unit} size="md" />
          <StockStatus stock={product.stock} unit={product.unit} />
        </div>
        <button
          className="btn btn-outline btn-sm btn-block pcard-add"
          disabled={product.stock <= 0}
          onClick={() => {
            add(product.id, 1);
            push({ title: "Added to cart", message: `${product.name} added to your cart.`, icon: "cart" });
          }}
        >
          <ShoppingCart size={15} /> Add to cart
        </button>
      </div>
    </article>
  );
}