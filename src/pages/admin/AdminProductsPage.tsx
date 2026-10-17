import { useState } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useActiveProducts } from "../../lib/registry";
import { categoryName } from "../../lib/registry";
import { getSupplierById, useProductFlags, toggleProductFeatured, setProductHidden } from "../../lib/registry";
import { useToast } from "../../lib/toast";
import { mwk } from "../../lib/format";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";
import ProductImage from "../../components/ui/ProductImage";

export default function AdminProductsPage() {
  const flags = useProductFlags();
  const activeProducts = useActiveProducts();
  const { push } = useToast();
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const rows = term
    ? activeProducts.filter(
        (p) => p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term) || categoryName(p.categoryId).toLowerCase().includes(term),
      )
    : activeProducts;

  /* Every moderation toggle is a real write; a rejected change says so
     instead of toasting a success the database never accepted. */
  async function run(
    work: Promise<{ ok: boolean; error?: string }>,
    success: { title: string; message: string; icon: "success" | "info" | "error" },
  ): Promise<void> {
    const result = await work;
    push(
      result.ok
        ? success
        : { title: "Not changed", message: result.error ?? "The server rejected the change.", icon: "error" },
    );
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "product",
      header: "Product",
      render: (p) => (
        <div className="row" style={{ gap: 10 }}>
          <ProductImage productId={p.id} categoryId={p.categoryId} name={p.name} imageUrl={p.image ?? p.images[0]} className="table-art" />
          <div>
            <Link to={`/products/${p.slug}`} className="small bold link">{p.name}</Link>
            <div className="xs muted">{getSupplierById(p.supplierId)?.name ?? p.supplierId}</div>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (p) => <span className="small">{categoryName(p.categoryId)}</span> },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (p) => <b>{mwk(p.price)}</b>,
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      render: (p) => <span>{p.stock}</span>,
    },
    {
      key: "popular",
      header: "Featured",
      render: (p) => {
        const featured = flags[p.id]?.featured ?? p.popular;
        return (
          <button
            className={`btn btn-sm ${featured ? "btn-primary" : "btn-outline"}`}
            onClick={() =>
              void run(toggleProductFeatured(p.id), {
                title: featured ? "Removed from featured" : "Marked as featured",
                message: p.name,
                icon: "info",
              })
            }
          >
            <Star size={13} /> {featured ? "Featured" : "Add"}
          </button>
        );
      },
    },
    {
      key: "visible",
      header: "Visibility",
      render: (p) => {
        const hidden = flags[p.id]?.hidden ?? false;
        return (
          <button
            className={`btn btn-sm ${hidden ? "btn-primary" : "btn-outline"}`}
            onClick={() =>
              void run(setProductHidden(p.id, !hidden), {
                title: hidden ? "Product visible again" : "Product hidden",
                message: p.name,
                icon: "info",
              })
            }
          >
            {hidden ? <><Eye size={13} /> Show</> : <><EyeOff size={13} /> Hide</>}
          </button>
        );
      },
    },
  ];

  return (
    <div className="stack dash-page">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Inventory</span>
          <h1 className="h-section">Products</h1>
          <p className="small muted">{activeProducts.length} active products across all supplier stores.</p>
        </div>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search product or brand…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search products"
        />
      </div>

      <div className="card card-pad">
        <DataTable
        columns={columns}
        rows={rows}
        minWidth={820}
        empty={term ? "No products match that search." : "No products in the marketplace yet."}
      />
      </div>
    </div>
  );
}