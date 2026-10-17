import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrders } from "../../lib/customerData";
import { useOrderStatuses, setOrderStatus } from "../../lib/registry";
import { useToast } from "../../lib/toast";
import { mwk, shortDate } from "../../lib/format";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";
import { CustomerOrderStatusBadge } from "../../components/marketplace/OrderStatus";
import type { CustomerOrderStatus } from "../../data/types";

function availableStatuses(status: CustomerOrderStatus): CustomerOrderStatus[] {
  if (status === "confirmed" || status === "preparing") return [status, "cancelled"];
  if (status === "ready") return [status, "out_for_delivery", "cancelled"];
  if (status === "out_for_delivery") return [status, "delivered", "cancelled"];
  return [status];
}

export default function AdminOrdersPage() {
  const customerOrders = useOrders();
  const overrides = useOrderStatuses();
  const { push } = useToast();
  const [filter, setFilter] = useState<CustomerOrderStatus | "all">("all");

  /** The server owns the status; a rejected change says so and the row keeps its stored value. */
  async function changeStatus(id: string, number: string, status: CustomerOrderStatus): Promise<void> {
    const result = await setOrderStatus(id, status);
    push(
      result.ok
        ? { title: "Status updated", message: `${number} is now ${status.replace(/_/g, " ")}.`, icon: "success" }
        : { title: "Status not changed", message: result.error ?? "The server rejected the change.", icon: "error" },
    );
  }

  const rows = customerOrders.map((o) => ({
    ...o,
    status: overrides[o.id] ?? o.status,
  }));

  const visible = filter === "all" ? rows : rows.filter((o) => o.status === filter);

  const summary = {
    total: rows.length,
    delivered: rows.filter((o) => o.status === "delivered").length,
    inProgress: rows.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length,
    cancelled: rows.filter((o) => o.status === "cancelled").length,
  };

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "order",
      header: "Order",
      render: (o) => (
        <div>
          <Link to={`/admin/orders/${o.id}`} className="small bold link">{o.number}</Link>
          <div className="xs muted">{shortDate(o.placedAt)}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div>
          <div className="small semibold">{o.customerName}</div>
          <div className="xs muted">{o.address.city} · {o.address.area}</div>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (o) => <span>{o.lines.length}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (o) => <b>{mwk(o.total)}</b>,
    },
    {
      key: "payment",
      header: "Payment",
      render: (o) => <span className="small">{o.payment.method}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (o) => (
        <div className="row" style={{ gap: 8 }}>
          <CustomerOrderStatusBadge status={o.status} />
          <select
            className="select select-sm"
            value={o.status}
            aria-label={`Change status for ${o.number}`}
            onChange={(e) => void changeStatus(o.id, o.number, e.target.value as CustomerOrderStatus)}
          >
            {availableStatuses(o.status).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      ),
    },
  ];

  return (
    <div className="stack dash-page">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Fulfilment</span>
          <h1 className="h-section">Orders</h1>
          <p className="small muted">
            {summary.total} orders · {summary.delivered} delivered · {summary.inProgress} in progress · {summary.cancelled} cancelled
          </p>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <button className={`chip${filter === "all" ? " chip-active" : ""}`} onClick={() => setFilter("all")}>
          All <span className="faq-chip-count">{summary.total}</span>
        </button>
        {(["delivered", "out_for_delivery", "preparing", "cancelled"] as CustomerOrderStatus[]).map((s) => (
          <button
            key={s}
            className={`chip${filter === s ? " chip-active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s.replace(/_/g, " ")} <span className="faq-chip-count">{rows.filter((o) => o.status === s).length}</span>
          </button>
        ))}
      </div>

      <div className="card card-pad">
        <DataTable columns={columns} rows={visible} minWidth={800} empty="No orders in the marketplace yet." />
      </div>
    </div>
  );
}