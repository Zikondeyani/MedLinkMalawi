import { useState } from "react";
import { getCategoryById } from "../../lib/registry";
import { hashString } from "../../lib/format";
import { CategoryIcon } from "./Icon";

const artVariants: { label: string; icon: string }[] = [
  { label: "device", icon: "activity" },
  { label: "shield", icon: "shield" },
  { label: "heart", icon: "stethoscope" },
];

/**
 * Deterministic SVG-style artwork used as product imagery.
 * A soft gradient derived from the product's category with a
 * subtle pattern, icon glyph and floating delivery dot.
 */
export default function ProductImage({
  productId,
  categoryId,
  name,
  imageUrl,
  className = "",
  height,
  iconName,
}: {
  productId: string;
  categoryId: string;
  name: string;
  imageUrl?: string;
  className?: string;
  height?: number;
  iconName?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const category = getCategoryById(categoryId);
  const [c1, c2] = category?.gradient ?? ["#0B1120", "#FFB74D"];
  const variant = artVariants[hashString(productId) % artVariants.length];
  const icon = iconName ?? variant.icon;
  const angle = 135 + (hashString(productId) % 40);

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <img
        className={`art art-photo ${className}`}
        src={imageUrl}
        alt={name}
        style={{ height, objectFit: "contain", background: "#fff" }}
        onError={() => setFailedUrl(imageUrl)}
      />
    );
  }

  return (
    <div
      className={`art ${className}`}
      style={{ height, background: `linear-gradient(${angle}deg, ${c1}, ${c2})` }}
      role="img"
      aria-label={name}
    >
      <div className="art-grid" />
      <div className="art-glow" />
      <div className="art-icon" style={hashString(productId) % 2 === 0 ? undefined : { background: "rgba(255,255,255,0.16)" }}>
        <CategoryIcon name={icon} size={34} strokeWidth={1.5} />
      </div>
      <span className="art-tag">{category?.name ?? "Medical"}</span>
      <span className="art-dot" />
    </div>
  );
}