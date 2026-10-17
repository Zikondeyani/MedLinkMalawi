import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronRight,
  Heart,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Zap,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCategoryById, categoryName } from "../lib/registry";
import { productBySlug, useActiveProducts } from "../lib/registry";
import { getSupplierById } from "../lib/registry";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { useToast } from "../lib/toast";
import { useWishlist } from "../lib/wishlist";
import { getPricing } from "../lib/registry";
import { mwk } from "../lib/format";
import PriceDisplay from "../components/ui/PriceDisplay";
import ProductImage from "../components/ui/ProductImage";
import QuantitySelector from "../components/ui/QuantitySelector";
import Rating from "../components/ui/Rating";
import VerificationBadge from "../components/ui/VerificationBadge";
import ProductCard, { StockStatus } from "../components/marketplace/ProductCard";
import { SupplierAvatar } from "../components/marketplace/SupplierCard";

export default function ProductDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const product = productBySlug(slug ?? "");
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const { add } = useCart();
  const { push } = useToast();
  const { has, toggle } = useWishlist();
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeProducts = useActiveProducts();

  const related = useMemo(() => {
    if (!product) return [];
    return activeProducts
      .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
      .slice(0, 4);
  }, [product, activeProducts]);

  if (!product) {
    return (
      <div className="container page">
        <h1 className="h-section">Product not found</h1>
        <p className="muted">This product may have been removed from the marketplace.</p>
        <Link to="/products" className="btn btn-primary" style={{ marginTop: 16 }}>Browse products</Link>
      </div>
    );
  }

  const supplier = getSupplierById(product.supplierId);
  const wished = has(product.id);
  const galleryIcons = ["activity", "shield", "stethoscope"];
  const productPhotos = product.images.length > 0 ? product.images : product.image ? [product.image] : [];
  const galleryLength = productPhotos.length > 0 ? productPhotos.length : galleryIcons.length;

  const buyNow = () => {
    add(product.id, qty);
    push({ title: "Added to cart", message: "Heading to checkout.", icon: "order" });
    navigate("/checkout");
  };

  return (
    <div className="page product-page container">
      {/* Breadcrumb */}
      <nav className="breadcrumb small muted" aria-label="Breadcrumb">
        <Link to="/">{user ? "Dashboard" : "Home"}</Link>
        <ChevronRight size={13} />
        <Link to="/products">Products</Link>
        <ChevronRight size={13} />
        <Link to={`/categories/${getCategoryById(product.categoryId)?.slug ?? ""}`}>
          {categoryName(product.categoryId)}
        </Link>
      </nav>

      <div className="product-top">
        {/* Gallery */}
        <div className="p-gallery">
          <div className="p-gallery-main">
            <ProductImage
              productId={product.id + imgIdx}
              categoryId={product.categoryId}
              name={product.name}
              imageUrl={productPhotos[imgIdx]}
              iconName={galleryIcons[imgIdx]}
              height={420}
            />
            <button
              className={`btn btn-icon wish-btn p-wish${wished ? " wished" : ""}`}
              aria-label="Save product"
              onClick={() => {
                toggle(product.id);
                push({ title: wished ? "Removed from saved" : "Saved to wishlist", message: product.name, icon: "info" });
              }}
            >
              <Heart size={18} fill={wished ? "currentColor" : "none"} />
            </button>
            {product.isNew && (
              <span className="pcard-flag p-new-flag">
                <Zap size={12} /> New
              </span>
            )}
          </div>
          <div className="p-thumbs">
            {[...Array(galleryLength)].map((_, i) => (
              <button
                key={i}
                className={i === imgIdx ? "thumb thumb-active" : "thumb"}
                onClick={() => setImgIdx(i)}
                aria-label={`View image ${i + 1}`}
              >
                <ProductImage productId={product.id + "t" + i} categoryId={product.categoryId} name={product.name} imageUrl={productPhotos[i]} iconName={galleryIcons[i]} height={76} />
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="p-info">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge badge-soft">{categoryName(product.categoryId)}</span>
            <span className="badge badge-teal">{product.brand}</span>
          </div>
          <h1 className="p-title">{product.name}</h1>
          {supplier && (
            <Link to={`/suppliers/${supplier.slug}`} className="p-supplier row" style={{ gap: 6 }}>
              <SupplierAvatar supplier={supplier} size={22} />
              <span>{supplier.name}</span>
              <VerificationBadge verified={supplier.verified} />
            </Link>
          )}
          <Rating value={product.rating} count={product.reviewCount} size="md" />
          <div className="p-price-row">
            <PriceDisplay price={product.price} unit={product.unit} size="lg" />
            <StockStatus stock={product.stock} unit={product.unit} />
          </div>

          <div className="p-qty-row">
            <span className="label">Quantity</span>
            <QuantitySelector value={qty} onChange={setQty} max={Math.max(product.stock, 1)} />
          </div>

          <div className="p-actions">
            <button
              className="btn btn-primary btn-lg grow"
              disabled={product.stock <= 0}
              onClick={() => {
                add(product.id, qty);
                push({ title: "Added to cart", message: `${product.name} × ${qty} added to your cart.`, icon: "cart" });
              }}
            >
              <ShoppingCart size={17} /> Add to Cart
            </button>
            <button className="btn btn-teal btn-lg grow" disabled={product.stock <= 0} onClick={buyNow}>
              <Zap size={17} /> Buy Now
            </button>
          </div>

          <div className="p-assurances">
            <div className="p-assurance">
              <ShieldCheck size={17} className="teal" />
              <div className="small"><b>Verified supplier</b><span className="muted"> Purchasing protected by MedLink</span></div>
            </div>
            <div className="p-assurance">
              <Truck size={17} className="teal" />
              <div className="small"><b>MedLink delivery</b><span className="muted"> {supplier ? supplier.delivery.estimate : "Fast"}</span></div>
            </div>
            <div className="p-assurance">
              <BadgeCheck size={17} className="teal" />
              <div className="small"><b>{product.warranty === "None" ? "Quality checked" : product.warranty + " warranty"}</b><span className="muted"> Genuine products only</span></div>
            </div>
          </div>
        </div>

        {/* Side */}
        <aside className="p-side">
          <div className="card card-pad">
            <h3 className="h-card" style={{ marginBottom: 12 }}>Delivery by MedLink</h3>
            <div className="summary-row">
              <span>Supplier</span><b>{supplier?.name}</b>
            </div>
            <div className="summary-row">
              <span>Located in</span><b>{supplier?.location.city}</b>
            </div>
            <div className="summary-row">
              <span>Delivery fee</span><b>{supplier ? mwk(supplier.delivery.fee) : "—"}</b>
            </div>
            <div className="summary-row">
              <span>Est. delivery</span><b>{supplier?.delivery.estimate}</b>
            </div>
            <hr className="divider-solid" style={{ margin: "14px 0" }} />
            <div className="delivery-who">
              <span><ShoppingCart size={13} /> MedLink checkout</span>
              <span className="delivery-who-arrow">→</span>
              <span><Truck size={13} /> MedLink delivers</span>
            </div>
            <p className="xs muted" style={{ marginTop: 10 }}>
              You pay once at checkout: product value goes to the supplier, plus a {Math.round(getPricing().serviceFeeRate * 100)}% MedLink service fee and a
              delivery fee. MedLink handles collection and delivery.
            </p>
          </div>
        </aside>
      </div>

      {/* Description + specs */}
      <div className="product-below split">
        <div className="stack">
          <div className="card card-pad p-block">
            <div className="p-block-head">
              <span className="eyebrow">About this product</span>
              <h2 className="h-card">Description</h2>
            </div>
            <p className="p-desc-text">{product.description}</p>
          </div>
          <div className="card card-pad p-block">
            <div className="p-block-head">
              <span className="eyebrow">Product details</span>
              <h2 className="h-card">Specifications</h2>
            </div>
            <div className="spec-list">
              {product.specs.map((s) => (
                <div key={s.label} className="spec-row">
                  <span className="spec-label">{s.label}</span>
                  <span className="spec-value">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="card card-pad p-seller">
          <h3 className="h-card row" style={{ gap: 8, marginBottom: 14 }}>
            <BadgeCheck size={18} className="teal" /> Seller information
          </h3>
          {supplier && (
            <>
              <div className="row" style={{ gap: 10 }}>
                <SupplierAvatar supplier={supplier} size={44} />
                <div>
                  <Link to={`/suppliers/${supplier.slug}`} className="small bold">{supplier.name}</Link>
                  <div><span className="badge badge-green" style={{ marginTop: 2 }}><BadgeCheck size={11} /> Verified</span></div>
                </div>
              </div>
              <div className="trust-row" style={{ marginTop: 14 }}>
                <Truck size={16} /> Sells {supplier.productCount} products with MedLink delivery
              </div>
              <Link to={`/suppliers/${supplier.slug}`} className="btn btn-outline btn-sm btn-block" style={{ marginTop: 14 }}>
                Visit store →
              </Link>
            </>
          )}
        </aside>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <h2 className="h-section" style={{ marginBottom: 20 }}>Related products</h2>
          <div className="p-grid p-grid-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}