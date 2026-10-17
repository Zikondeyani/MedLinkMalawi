import { useState } from "react";
import { ArrowRight, MapPin, Package } from "lucide-react";
import { Link } from "react-router-dom";
import type { Supplier } from "../../data/types";
import { initials } from "../../lib/format";
import VerificationBadge from "../ui/VerificationBadge";

export function SupplierAvatar({ supplier, size = 52 }: { supplier: Supplier; size?: number }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoUrl = supplier.logoImage;

  return (
    <span
      className="s-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, ${supplier.color}, #0B1120)`,
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {logoUrl && failedLogoUrl !== logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#fff" }}
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : initials(supplier.name)}
    </span>
  );
}

export default function SupplierCard({ supplier }: { supplier: Supplier }) {
  return (
    <article className="card card-hover scard" style={{ overflow: "hidden" }}>
      <div
        className="scard-banner"
        style={{
          background: supplier.bannerImage
            ? `url(${supplier.bannerImage}) center / contain no-repeat`
            : `linear-gradient(120deg, ${supplier.bannerGradient[0]}, ${supplier.bannerGradient[1]})`,
          backgroundColor: supplier.bannerGradient[0],
        }}
      >
        {!supplier.bannerImage && (
          <>
            <div className="bg-grid-pattern" />
            <div className="scard-banner-art" />
          </>
        )}
        <span className="scard-verify">
          <VerificationBadge verified={supplier.verified} label={supplier.verified ? "Verified" : "Partner"} />
        </span>
      </div>

      <div className="scard-body">
        <div className="scard-head">
          <SupplierAvatar supplier={supplier} size={56} />
          <div className="scard-title">
            <Link to={`/suppliers/${supplier.slug}`} className="scard-name">
              {supplier.name}
            </Link>
            <span className="scard-cat muted small">{supplier.category}</span>
          </div>
          <Link to={`/suppliers/${supplier.slug}`} className="scard-go" aria-label={`Visit ${supplier.name}`}>
            <ArrowRight size={17} />
          </Link>
        </div>

        <div className="scard-meta">
          <span className="scard-meta-item">
            <Package size={14} /> {supplier.productCount} products
          </span>
          <span className="scard-meta-item">
            <MapPin size={14} /> {supplier.location.city}
          </span>
        </div>

        <Link to={`/suppliers/${supplier.slug}`} className="scard-link">
          Visit store <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}