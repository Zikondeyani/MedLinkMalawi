import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useSuppliers } from "../lib/registry";
import { productsBySupplier } from "../lib/registry";
import { getCategoryById } from "../lib/registry";
import { SupplierAvatar } from "../components/marketplace/SupplierCard";
import ProductGrid from "../components/marketplace/ProductGrid";
import Rating from "../components/ui/Rating";
import VerificationBadge from "../components/ui/VerificationBadge";
import EmptyState from "../components/ui/EmptyState";
import { prettyDate } from "../lib/format";

type Tab = "products" | "categories" | "about";

export default function SupplierStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const suppliers = useSuppliers();
  const supplier = suppliers.find((s) => s.slug === slug && !s.suspended);
  const [tab, setTab] = useState<Tab>("products");
  const [activeCat, setActiveCat] = useState("");

  const storeProducts = useMemo(() => (supplier ? productsBySupplier(supplier.id) : []), [supplier]);
  const productCats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const p of storeProducts) {
      const c = getCategoryById(p.categoryId);
      if (!c) continue;
      const cur = map.get(c.id) ?? { id: c.id, name: c.name, count: 0 };
      cur.count++;
      map.set(c.id, cur);
    }
    return [...map.values()];
  }, [storeProducts]);

  const visibleProducts = activeCat ? storeProducts.filter((p) => p.categoryId === activeCat) : storeProducts;

  if (!supplier) {
    return (
      <div className="container page">
        <EmptyState icon="search" title="Supplier not found" message="This store may have been removed from MedLink." />
      </div>
    );
  }

  return (
    <div className="store-page">
      {/* Banner */}
      <div
        className="store-banner"
        style={{
          background: supplier.bannerImage
            ? `url(${supplier.bannerImage}) center / cover no-repeat`
            : `linear-gradient(120deg, ${supplier.bannerGradient[0]}, ${supplier.bannerGradient[1]})`,
          backgroundColor: supplier.bannerGradient[0],
        }}
      >
        {!supplier.bannerImage && (
          <>
            <div className="bg-grid-pattern" />
            <div className="store-banner-art" />
          </>
        )}
      </div>

      <div className="container">
        <Link to="/suppliers" className="link-muted xs row" style={{ marginTop: 16, gap: 6 }}>
          <ArrowLeft size={14} /> All suppliers
        </Link>

        {/* Store header */}
        <div className="store-head card">
          <div className="store-head-main">
            <SupplierAvatar supplier={supplier} size={72} />
            <div className="grow">
              <div className="row wrap">
                <h1 className="store-name">{supplier.name}</h1>
                <VerificationBadge verified={supplier.verified} />
              </div>
              <div className="store-meta">
                <span className="row" style={{ gap: 6 }}>
                  <Store size={15} className="muted" /> {supplier.category}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <MapPin size={15} className="muted" /> {supplier.location.city} · {supplier.location.area}
                </span>
              </div>
              <div className="store-rating-row">
                <Rating value={supplier.rating} count={supplier.reviewCount} size="md" />
                <span className="muted small">· {supplier.productCount} products</span>
              </div>
            </div>
            <div className="store-head-actions">
              <Link to={`/products?supplier=${supplier.id}`} className="btn btn-outline btn-sm">
                <Package size={15} /> Browse products
              </Link>
              <button className="btn btn-primary btn-sm">Contact store</button>
            </div>
          </div>

          <div className="store-info-grid">
            <div className="store-info-item">
              <Phone size={16} className="muted" />
              <div>
                <small className="muted">Phone</small>
                <b className="small">{supplier.phone}</b>
              </div>
            </div>
            <div className="store-info-item">
              <Mail size={16} className="muted" />
              <div>
                <small className="muted">Email</small>
                <b className="small">{supplier.email}</b>
              </div>
            </div>
            <div className="store-info-item">
              <Calendar size={16} className="muted" />
              <div>
                <small className="muted">Joined</small>
                <b className="small">{prettyDate(supplier.joined)}</b>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" role="tablist">
          <button className={`tab${tab === "products" ? " tab-active" : ""}`} onClick={() => setTab("products")}>
            Products ({storeProducts.length})
          </button>
          <button className={`tab${tab === "categories" ? " tab-active" : ""}`} onClick={() => setTab("categories")}>
            Categories
          </button>
          <button className={`tab${tab === "about" ? " tab-active" : ""}`} onClick={() => setTab("about")}>
            About
          </button>
        </div>

        {/* Tab: products */}
        {tab === "products" && (
          <div style={{ marginTop: 24 }}>
            {productCats.length > 1 && (
              <div className="row wrap" style={{ marginBottom: 18 }}>
                <button className={activeCat === "" ? "chip chip-active" : "chip"} onClick={() => setActiveCat("")}>
                  All
                </button>
                {productCats.map((c) => (
                  <button key={c.id} className={activeCat === c.id ? "chip chip-active" : "chip"} onClick={() => setActiveCat(c.id)}>
                    {c.name} ({c.count})
                  </button>
                ))}
              </div>
            )}
            {visibleProducts.length === 0 ? (
              <EmptyState icon="search" title="No products in this category" message="Try another category." />
            ) : (
              <ProductGrid products={visibleProducts} cols={4} />
            )}
          </div>
        )}

        {/* Tab: categories */}
        {tab === "categories" && (
          <div className="p-grid p-grid-3" style={{ marginTop: 24 }}>
            {productCats.map((c) => (
              <button
                key={c.id}
                className="card card-hover store-cat-chip"
                onClick={() => {
                  setActiveCat(c.id);
                  setTab("products");
                }}
              >
                <b>{c.name}</b>
                <span className="muted small">{c.count} products</span>
              </button>
            ))}
          </div>
        )}

        {/* Tab: about */}
        {tab === "about" && (
          <div className="card card-pad" style={{ marginTop: 24 }}>
            <h3 className="h-card row" style={{ gap: 8, marginBottom: 10 }}>
              <Building2 size={18} className="teal" /> About this store
            </h3>
            <p className="small muted" style={{ lineHeight: 1.7 }}>{supplier.description}</p>
            <div className="trust-row" style={{ marginTop: 16 }}>
              <ShieldCheck size={17} /> {supplier.verified ? "Identity and business documents verified by MedLink" : "Verification in progress"}
            </div>
            <div className="trust-row">
              <Truck size={17} /> Items are collected and delivered by the MedLink delivery service
            </div>
          </div>
        )}
      </div>
    </div>
  );
}