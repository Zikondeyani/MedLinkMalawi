import { useMemo, useState } from "react";
import { Check, ChevronRight, PackageCheck, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { updateSupplierOrderStatus, useSupplierOrders } from "../../lib/customerData";
import { useCurrentSupplierId } from "../../lib/registry";
import type { SupplierOrder, SupplierOrderStatus } from "../../data/types";
import { mwk, shortDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { SupplierOrderStatusBadge } from "../../components/marketplace/OrderStatus";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";

const stageOrder: SupplierOrderStatus[] = ["new", "confirmed", "preparing", "ready", "completed"];

export default function SupplierOrdersPage() {
  const { push } = useToast();
  const supplierId = useCurrentSupplierId();
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "cancelled">("all");
  // The database decides which rows this store may see; no local copy.
  const orders: SupplierOrder[] = useSupplierOrders().filter(
    (order) => !supplierId || order.supplierId === supplierId,
  );

  const visible = useMemo(() => {
    if (filter === "pending") return orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
    if (filter === "completed") return orders.filter((o) => o.status === "completed");
    if (filter === "cancelled") return orders.filter((o) => o.status === "cancelled");
    return orders;
  }, [orders, filter]);

  const advance = async (o: SupplierOrder) => {
    const idx = stageOrder.indexOf(o.status);
    if (idx >= stageOrder.length - 1) return;
    const next = stageOrder[idx + 1];
    // The status is written by the server; the list refreshes from the row.
    const result = await updateSupplierOrderStatus(o.id, next);
    if (!result.ok) {
      push({ title: "Not updated", message: result.error ?? "The status change was rejected.", icon: "error" });
      return;
    }
    if (next === "confirmed") push({ title: "Order accepted", message: `${o.number} confirmed. MedLink notified.`, icon: "success" });
    if (next === "ready") push({ title: "Marked as ready", message: `MedLink has been notified to collect ${o.number}.`, icon: "order" });
  };

  const columns: Column<SupplierOrder>[] = [
    {
      key: "order",
      header: "Order",
      render: (o) => (
        <div>
          <Link to={`/supplier/orders/${o.id}`} className="small bold link">{o.number}</Link>
          <div className="xs muted">{shortDate(o.placedAt)}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Who ordered",
      render: (o) => (
        <div>
          <div className="small semibold">{o.customerOrg}</div>
          <div className="xs muted">{o.customerName} · {o.city}</div>
        </div>
      ),
    },
    { key: "items", header: "Products", render: (o) => <span>{o.itemsTotal} items</span> },
    {
      key: "total",
      header: "Total",
      render: (o) => (
        <div>
          <b>{mwk(o.total)}</b>
          <div className="xs muted">{o.paymentMethod}</div>
        </div>
      ),
      align: "right",
    },
    {
      key: "status",
      header: "Status",
      render: (o) => <SupplierOrderStatusBadge status={o.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (o) => {
        if (o.status === "new")
          return (
            <button className="btn btn-teal btn-sm" onClick={() => advance(o)}>
              <Check size={14} /> Accept Order
            </button>
          );
        if (o.status === "confirmed")
          return (
            <button className="btn btn-outline btn-sm" onClick={() => advance(o)}>
              <PackageCheck size={14} /> Start Preparing
            </button>
          );
        if (o.status === "preparing")
          return (
            <button className="btn btn-primary btn-sm" onClick={() => advance(o)}>
              <PackageCheck size={14} /> Mark as Ready
            </button>
          );
        if (o.status === "ready")
          return (
            <span className="badge badge-navy"><Truck size={12} /> Awaiting pickup</span>
          );
        if (o.status === "completed")
          return <span className="badge badge-green">Completed</span>;
        return (
          <Link to={`/supplier/orders/${o.id}`} className="btn btn-outline btn-sm">
            View <ChevronRight size={14} />
          </Link>
        );
      },
    },
  ];

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Fulfilment</span>
          <h1 className="h-section">Orders</h1>
          <p className="small muted">Accept orders, prepare items and hand them to MedLink for delivery.</p>
        </div>
      </div>

      <div className="row wrap">
        <button className={filter === "all" ? "chip chip-active" : "chip"} onClick={() => setFilter("all")}>All ({orders.length})</button>
        <button className={filter === "pending" ? "chip chip-active" : "chip"} onClick={() => setFilter("pending")}>Pending ({orders.filter((o) => o.status !== "completed" && o.status !== "cancelled").length})</button>
        <button className={filter === "completed" ? "chip chip-active" : "chip"} onClick={() => setFilter("completed")}>Completed ({orders.filter((o) => o.status === "completed").length})</button>
        <button className={filter === "cancelled" ? "chip chip-active" : "chip"} onClick={() => setFilter("cancelled")}>Cancelled ({orders.filter((o) => o.status === "cancelled").length})</button>
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        minWidth={780}
        empty={filter === "all" ? "No orders for your store yet." : "No orders in this view."}
      />
    </div>
  );
}