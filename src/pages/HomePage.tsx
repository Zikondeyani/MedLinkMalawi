import { ArrowRight, BadgeCheck, ClipboardCheck, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { getSupplierById, useActiveProducts, useCategories, usePricing, useSuppliers } from "../lib/registry";
import { useAuth } from "../lib/auth";
import SearchBar from "../components/ui/SearchBar";
import SupplierCard from "../components/marketplace/SupplierCard";
import ProductGrid from "../components/marketplace/ProductGrid";
import ProductImage from "../components/ui/ProductImage";
import PriceDisplay from "../components/ui/PriceDisplay";
import HomeFaq from "../components/marketplace/HomeFaq";
import HomeSignIn from "../components/auth/HomeSignIn";
import CustomerDashboard from "../components/marketplace/CustomerDashboard";

export default function HomePage() {
  const cats = useCategories();
  const suppliers = useSuppliers();
  const activeProducts = useActiveProducts();
  const pricing = usePricing();
  const featured = activeProducts.filter((p) => p.popular).slice(0, 4);
  const { user } = useAuth();

  // Per-city delivery rates if MedLink has set any, otherwise delivery is flat
  // everywhere and the strip says so instead of showing zero.
  const cityCount = Object.keys(pricing.deliveryFees).length || null;

  // Hero claims must match the marketplace, so derive them from the rows.
  const deliveryEstimates = [
    ...new Set(suppliers.map((s) => s.delivery.estimate).filter(Boolean)),
  ];
  const deliveryLine = deliveryEstimates.length
    ? `Typically ${deliveryEstimates.slice(0, 2).join(" or ")}`
    : "Collected and delivered by MedLink";
  const storeCities = [...new Set(suppliers.map((s) => s.location.city).filter(Boolean))];
  const citiesLine = storeCities.length
    ? `In ${storeCities.slice(0, 4).join(", ")}${storeCities.length > 4 ? ` +${storeCities.length - 4}` : ""}`
    : "Suppliers are signing up now";

  // Signed-in users never see the marketing home — it becomes their
  // dashboard instead. Suppliers and admins land on their own dashboards.
  if (user) {
    if (user.role === "supplier") return <Navigate to="/supplier" replace />;
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    return <CustomerDashboard />;
  }

  const topSuppliers = [...suppliers.filter((s) => !s.suspended)].sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <div className="home">
      {/* ---------- Hero ---------- */}
      <section className="hero">
        <div className="bg-grid-pattern hero-grid" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">
              <span className="hero-pulse" /> Malawi's medical marketplace
            </span>
            <h1 className="h-display hero-title">
              Everything Healthcare Needs. <span className="hero-highlight">In One Place.</span>
            </h1>
            <p className="hero-sub">
              Discover trusted medical suppliers and order medical equipment, pharmaceutical supplies,
              laboratory products and healthcare essentials with reliable delivery.
            </p>
            <div className="hero-search">
              <SearchBar variant="hero" placeholder="Try “blood pressure”, “microscope”, “gloves”..." />
            </div>
            <div className="hero-actions">
              <Link to="/products" className="btn btn-teal btn-lg">
                Browse Products <ArrowRight size={17} />
              </Link>
              <Link to="/suppliers" className="btn btn-outline btn-lg">
                Explore Suppliers
              </Link>
            </div>
            <div className="hero-trust">
              <span><ShieldCheck size={15} /> Verified suppliers</span>
              <span><Truck size={15} /> MedLink delivery</span>
              <span><ClipboardCheck size={15} /> Secure checkout</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-stage">
              <div className="hero-glowring" />
              <div className="hero-orbit hero-orbit-1" />
              <div className="hero-orbit hero-orbit-2" />

              {/* Product showcase */}
              {featured.slice(0, 3).map((p, i) => (
                <Link key={p.id} to={`/products/${p.slug}`} className={`hero-show hero-show-${i + 1}`}>
                  <ProductImage productId={p.id} categoryId={p.categoryId} name={p.name} imageUrl={p.image ?? p.images[0]} className="hero-show-img" />
                  {i < 2 && (
                    <div className="hero-show-body">
                      <small className="hero-show-supplier">{getSupplierById(p.supplierId)?.name}</small>
                      <b className="hero-show-name">{p.name}</b>
                      <div className="hero-show-row">
                        <PriceDisplay price={p.price} unit={p.unit} size="md" />
                        <span className="hero-show-chip">
                          <ShoppingCart size={13} /> Add
                        </span>
                      </div>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="hero-show-mini">
                      <span className="hero-show-mini-price">
                        <PriceDisplay price={p.price} size="sm" />
                      </span>
                      <span className="badge badge-teal">In stock</span>
                    </div>
                  )}
                </Link>
              ))}

              {/* Floating chips — both claims come from the database */}
              <div className="hero-float hero-float-1 card">
                <span className="hero-float-icon teal"><Truck size={17} /></span>
                <div>
                  <b>MedLink delivery</b>
                  <small>{deliveryLine}</small>
                </div>
              </div>
              <div className="hero-float hero-float-2 card">
                <span className="hero-float-icon green"><BadgeCheck size={17} /></span>
                <div>
                  <b>{suppliers.filter((s) => s.verified).length} verified suppliers</b>
                  <small>{citiesLine}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stats strip — live counts from the marketplace ---------- */}
      <section className="stats-strip">
        <div className="container stats-grid">
          <div className="stat"><b>{suppliers.length}</b><span>Trusted suppliers</span></div>
          <div className="stat"><b>{activeProducts.length}</b><span>Medical products</span></div>
          <div className="stat"><b>{cats.length}</b><span>Departments</span></div>
          <div className="stat">
            <b>{cityCount ?? "All"}</b>
            <span>{cityCount ? "Cities with delivery" : "Nationwide delivery"}</span>
          </div>
        </div>
      </section>

      {/* ---------- Categories (pill nav) ---------- */}
      <section className="section categories-section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Shop by department</span>
            <h2 className="h-section">Product Categories</h2>
            <p>Find exactly what your facility needs — from monitoring devices to surgical essentials.</p>
          </div>
        </div>
        <div className="cat-pills no-scrollbar">
          {cats.map((c) => (
            <Link key={c.id} to={`/categories/${c.slug}`} className="cat-pill">
              {c.name}
              <span className="cat-pill-count">{c.productCount}</span>
            </Link>
          ))}
          <Link to="/categories" className="cat-pill cat-pill-all">
            All categories <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ---------- Featured products ---------- */}
      <section className="section section-alt container-fluid">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">Popular right now</span>
              <h2 className="h-section">Featured Products</h2>
              <p>High-demand medical supplies, ready to be delivered by MedLink.</p>
            </div>
            <Link to="/products" className="btn btn-outline btn-sm hide-mobile">View all products <ArrowRight size={14} /></Link>
          </div>
          <ProductGrid products={featured} cols={4} />
        </div>
      </section>

      {/* ---------- Featured suppliers ---------- */}
      <section className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Trusted stores</span>
            <h2 className="h-section">Featured Suppliers</h2>
            <p>Buy direct from verified medical suppliers with MedLink handling checkout and delivery.</p>
          </div>
          <Link to="/suppliers" className="btn btn-outline btn-sm hide-mobile">All suppliers <ArrowRight size={14} /></Link>
        </div>
        <div className="grid grid-3">
          {topSuppliers.map((s) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </div>
      </section>

      {/* ---------- How MedLink works ---------- */}
      <section className="section how">
        <div className="container">
          <div className="section-head" style={{ justifyContent: "center", textAlign: "center" }}>
            <div>
              <span className="eyebrow">Delivered by MedLink</span>
              <h2 className="h-section">How the marketplace works</h2>
              <p style={{ marginInline: "auto" }}>You pay once through MedLink checkout. We handle delivery from supplier to your door.</p>
            </div>
          </div>
          <div className="how-grid">
            <div className="card how-card">
              <span className="how-num">01</span>
              <h3>Browse & order</h3>
              <p className="small muted">Find products from verified medical suppliers across Malawi.</p>
            </div>
            <div className="card how-card">
              <span className="how-num">02</span>
              <h3>Pay through MedLink</h3>
              <p className="small muted">One secure checkout — Mobile Money, card or bank transfer.</p>
            </div>
            <div className="card how-card">
              <span className="how-num">03</span>
              <h3>We deliver</h3>
              <p className="small muted">Suppliers prepare your order and MedLink delivers it to your door.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- FAQs (partial preview) ---------- */}
      <HomeFaq />

      {/* ---------- Sign in (when not signed in) ---------- */}
      {!user && <HomeSignIn />}

      {/* ---------- CTA ---------- */}
      <section className="section container">
        <div className="cta-banner">
          <div className="bg-grid-pattern" />
          <div className="cta-copy">
            <h2 className="h-section">Own a medical business? Sell on MedLink.</h2>
            <p>Apply with your business details and KYC documents — once verified, your store goes live to healthcare buyers nationwide.</p>
          </div>
          <Link to="/become-a-supplier" className="btn btn-primary btn-lg">
            Become a supplier <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}