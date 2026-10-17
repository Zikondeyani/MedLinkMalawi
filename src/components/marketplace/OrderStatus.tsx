import type { CustomerOrderStatus, SupplierOrderStatus } from "../../data/types";

const customerStatusMap: Record<CustomerOrderStatus, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "badge-teal" },
  preparing: { label: "Preparing Order", tone: "badge-amber" },
  ready: { label: "Ready for Pickup", tone: "badge-navy" },
  out_for_delivery: { label: "Out for Delivery", tone: "badge-teal" },
  delivered: { label: "Delivered", tone: "badge-green" },
  cancelled: { label: "Cancelled", tone: "badge-red" },
};

const supplierStatusMap: Record<SupplierOrderStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "badge-teal" },
  confirmed: { label: "Confirmed", tone: "badge-amber" },
  preparing: { label: "Preparing", tone: "badge-amber" },
  ready: { label: "Ready for Pickup", tone: "badge-navy" },
  completed: { label: "Completed", tone: "badge-green" },
  cancelled: { label: "Cancelled", tone: "badge-red" },
};

export function CustomerOrderStatusBadge({ status }: { status: CustomerOrderStatus }) {
  const s = customerStatusMap[status];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export function SupplierOrderStatusBadge({ status }: { status: SupplierOrderStatus }) {
  const s = supplierStatusMap[status];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}