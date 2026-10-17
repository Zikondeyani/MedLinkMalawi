import { useState } from "react";
import { Package } from "lucide-react";
import type { CSSProperties } from "react";

export default function OrderItemImage({
  image,
  name,
  className,
  style,
}: {
  image: string;
  name: string;
  className: string;
  style?: CSSProperties;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);

  return (
    <span className={className} style={style}>
      {image && failedImage !== image ? (
        <img src={image} alt={name} onError={() => setFailedImage(image)} />
      ) : (
        <Package size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
    </span>
  );
}
