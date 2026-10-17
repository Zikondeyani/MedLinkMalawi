import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getCategoryById, deleteProduct, productById, productsBySupplier, updateProduct, useCurrentSupplierId } from "../../lib/registry";
import { mwk } from "../../lib/format";
import { useToast } from "../../lib/toast";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import ProductImage from "../../components/ui/ProductImage";

export default function SupplierProductsPage() {
  const supplierId = useCurrentSupplierId();
  // The list is the database's, refreshed after every write — no local copy.
  const cutList = supplierId ? productsBySupplier(supplierId) : [];
  const { push } = useToast();
  const [stockModal, setStockModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stockProduct = stockModal ? productById(stockModal) : null;
  const [stockVal, setStockVal] = useState("10");

  const openStock = (id: string) => {
    setStockVal(String(productById(id)?.stock ?? 10));
    setStockModal(id);
  };

  async function saveStock(): Promise<void> {
    if (!stockModal) return;
    const quantity = Number(stockVal);
    if (!Number.isInteger(quantity) || quantity < 0) {
      push({ title: "Check the quantity", message: "Enter a whole stock count of 0 or more.", icon: "error" });
      return;
    }

    setSaving(true);
    const result = await updateProduct(stockModal, { stock: quantity });
    setSaving(false);
    if (!result.ok) {
      push({ title: "Stock not updated", message: result.error ?? "The server rejected the change.", icon: "error" });
      return;
    }
    push({
      title: "Stock updated",
      message: `${stockProduct?.name ?? "Product"} is now at ${quantity} in stock.`,
      icon: "success",
    });
    setStockModal(null);
  }

  async function remove(id: string): Promise<void> {
    const p = productById(id);
    const result = await deleteProduct(id);
    if (!result.ok) {
      push({ title: "Not removed", message: result.error ?? "The server rejected the change.", icon: "error" });
      return;
    }
    push({ title: "Product removed", message: `${p?.name ?? "Product"} was removed from your store.`, icon: "info" });
  }

  const columns: Column<(typeof cutList)[number]>[] = [
    {
      key: "product",
      header: "Product",
      render: (p) => (
        <div className="row" style={{ gap: 12 }}>
          <ProductImage productId={p.id} categoryId={p.categoryId} name={p.name} imageUrl={p.image ?? p.images[0]} height={44} className="table-art" />
          <div>
            <b className="small">{p.name}</b>
            <div className="xs muted">{p.brand} · {p.model}</div>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (p) => <span className="badge badge-soft">{getCategoryById(p.categoryId)?.name ?? "—"}</span>,
    },
    { key: "price", header: "Price", render: (p) => <b>{mwk(p.price)}</b>, align: "right" },
    {
      key: "stock",
      header: "Stock",
      render: (p) => (
        <button className={`stock ${p.stock < 10 ? "stock-low" : "stock-in"}`} onClick={() => openStock(p.id)} title="Update stock">
          <span className={`dot ${p.stock < 10 ? "stock-dot-amber" : "stock-dot-green"}`} /> {p.stock}
        </button>
      ),
      align: "right",
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <span className={`badge ${p.status === "active" ? "badge-green" : "badge-soft"}`}>{p.status}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (p) => (
        <div className="row" style={{ gap: 6 }}>
          <Link to={`/supplier/products/${p.id}/edit`} className="btn btn-outline btn-sm" aria-label="Edit product">
            <Pencil size={13} /> Edit
          </Link>
          <button className="btn btn-danger btn-sm" onClick={() => void remove(p.id)} aria-label="Delete product">
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Catalog</span>
          <h1 className="h-section">Products</h1>
          <p className="small muted">{cutList.length} products listed in your store.</p>
        </div>
        <Link to="/supplier/products/new" className="btn btn-primary btn-sm">
          <Plus size={15} /> Add Product
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={cutList}
        minWidth={740}
        empty="No products in your store yet. Add your first product to start selling."
      />

      <Modal
        open={stockModal !== null}
        onClose={() => setStockModal(null)}
        title={`Update stock — ${stockProduct?.name ?? ""}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setStockModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void saveStock()} disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : null} Update stock
            </button>
          </>
        }
      >
        <div className="field">
          <label className="label" htmlFor="stockval">Stock quantity</label>
          <input
            id="stockval"
            className="input"
            type="number"
            min={0}
            value={stockVal}
            onChange={(e) => setStockVal(e.target.value)}
          />
          <span className="xs muted">Quantity of units currently available. MedLink shows this to customers.</span>
        </div>
      </Modal>
    </div>
  );
}