import { useMemo, useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { productsBySupplier, useCurrentSupplierId, useProducts } from "../../lib/registry";
import { mwk } from "../../lib/format";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";
import ProductImage from "../../components/ui/ProductImage";
import type { Product } from "../../data/types";

export default function SupplierInventoryPage() {
  const supplierId = useCurrentSupplierId();
  const products = useProducts();
  // Memoised so the derived rows below only recompute when the store changes.
  const storeProducts = useMemo(() => (supplierId ? productsBySupplier(supplierId) : []), [supplierId, products]);
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let list = storeProducts;
    if (filter === "low") list = list.filter((p) => p.stock > 0 && p.stock < 10);
    if (filter === "out") list = list.filter((p) => p.stock <= 0);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
    return list;
  }, [storeProducts, filter, q]);

  const totalUnits = storeProducts.reduce((a, p) => a + p.stock, 0);
  const lowCount = storeProducts.filter((p) => p.stock > 0 && p.stock < 10).length;
  const outCount = storeProducts.filter((p) => p.stock <= 0).length;

  const columns: Column<Product>[] = [
    {
      key: "product",
      header: "Product",
      render: (p) => (
        <div className="row" style={{ gap: 12 }}>
          <ProductImage productId={p.id} categoryId={p.categoryId} name={p.name} imageUrl={p.image ?? p.images[0]} height={44} className="table-art" />
          <div>
            <b className="small">{p.name}</b>
            <div className="xs muted">{p.sku}</div>
          </div>
        </div>
      ),
    },
    { key: "price", header: "Unit price", render: (p) => mwk(p.price), align: "right" },
    {
      key: "stock",
      header: "Stock",
      render: (p) => (
        <span className={p.stock === 0 ? "stock stock-out" : p.stock < 10 ? "stock stock-low" : "stock stock-in"}>
          <span className={`dot ${p.stock === 0 ? "stock-dot-red" : p.stock < 10 ? "stock-dot-amber" : "stock-dot-green"}`} />
          {p.stock} {p.unit}
        </span>
      ),
      align: "right",
    },
    {
      key: "value",
      header: "Stock value",
      render: (p) => <b>{mwk(p.price * p.stock)}</b>,
      align: "right",
    },
    {
      key: "action",
      header: "",
      render: (p) => (
        <Link to={`/supplier/products/${p.id}/edit`} className="btn btn-outline btn-sm">Manage</Link>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Stock levels</span>
          <h1 className="h-section">Inventory</h1>
          <p className="small muted">{storeProducts.length} products · {totalUnits} units in stock.</p>
        </div>
      </div>

      <div className="grid grid-3 dash-grid">
        <div className="card inventory-stat">
          <span className="inventory-icon teal"><Package size={18} /></span>
          <div><b>{totalUnits}</b><small>Units in stock</small></div>
        </div>
        <div className="card inventory-stat">
          <span className="inventory-icon amber"><AlertTriangle size={18} /></span>
          <div><b>{lowCount}</b><small>Low stock (&lt; 10)</small></div>
        </div>
        <div className="card inventory-stat">
          <span className="inventory-icon red"><Package size={18} /></span>
          <div><b>{outCount}</b><small>Out of stock</small></div>
        </div>
      </div>

      {lowCount > 0 && (
        <div className="card card-pad low-stock-banner">
          <AlertTriangle size={18} className="amber" />
          <p className="small">
            <b>{lowCount} product{lowCount === 1 ? "" : "s"}</b> are running low. Restock soon to avoid losing sales.
          </p>
        </div>
      )}

      <div className="between wrap" style={{ gap: 12 }}>
        <div className="row wrap">
          <button className={filter === "all" ? "chip chip-active" : "chip"} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "low" ? "chip chip-active" : "chip"} onClick={() => setFilter("low")}>Low stock</button>
          <button className={filter === "out" ? "chip chip-active" : "chip"} onClick={() => setFilter("out")}>Out of stock</button>
        </div>
        <input
          className="input"
          placeholder="Search SKU or product..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 300 }}
          aria-label="Search inventory"
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={740}
        empty={
          filter !== "all" || q.trim()
            ? "No products match this view."
            : "Your store has no products yet."
        }
      />
    </div>
  );
}