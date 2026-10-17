import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  HandCoins,
  Landmark,
  Lock,
  Send,
  ShieldCheck,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useOrders } from "../../lib/customerData";
import {
  getSupplierById,
  getPricing,
  payoutAccountSummary,
  releaseSupplierFunds,
  supplierEscrow,
  usePaymentTransactions,
  usePayouts,
  useReleasedOrders,
  useSuppliers,
} from "../../lib/registry";
import { useToast } from "../../lib/toast";
import { mwk, mwkCompact, prettyDate, timeOnly } from "../../lib/format";
import DashboardCard from "../../components/ui/DashboardCard";
import DataTable from "../../components/ui/DataTable";
import type { Column } from "../../components/ui/DataTable";
import Modal from "../../components/ui/Modal";
import { SupplierAvatar } from "../../components/marketplace/SupplierCard";
import type { PaymentTransaction } from "../../data/types";

type EscrowRow = {
  supplier: ReturnType<typeof useSuppliers>[number];
  heldAmount: number;
  orderCount: number;
  orderNumbers: string[];
  serviceFee: number;
};

type PayFilter = "all" | "succeeded" | "failed";

export default function AdminTransactionsPage() {
  const suppliers = useSuppliers();
  const customerOrders = useOrders();
  const released = useReleasedOrders();
  const payouts = usePayouts();
  const payments = usePaymentTransactions();
  const { push } = useToast();
  const [releaseTarget, setReleaseTarget] = useState<EscrowRow | null>(null);
  const [payFilter, setPayFilter] = useState<PayFilter>("all");

  const succeededCount = payments.filter((p) => p.status === "succeeded").length;
  const failedCount = payments.filter((p) => p.status === "failed").length;
  const filteredPayments =
    payFilter === "all" ? payments : payments.filter((p) => p.status === payFilter);

  /* Derived escrow state — computed in render from stable store references. */
  const rows: EscrowRow[] = suppliers.map((supplier) => {
    const escrow = supplierEscrow(supplier.id, released);
    return {
      supplier,
      heldAmount: escrow.heldAmount,
      orderCount: escrow.orderCount,
      orderNumbers: escrow.orderNumbers,
      serviceFee: escrow.serviceFee,
    };
  });

  const active = customerOrders.filter((o) => o.status !== "cancelled");
  const goodsTotal = active.reduce(
    (sum, o) => sum + o.lines.reduce((s, l) => s + l.price * l.quantity, 0),
    0,
  );
  const serviceFeeIncome = Math.round(goodsTotal * getPricing().serviceFeeRate);
  const deliveryIncome = active.reduce((sum, o) => sum + o.deliveryFee, 0);
  const paidIn = goodsTotal + serviceFeeIncome + deliveryIncome;
  const medlinkRevenue = serviceFeeIncome + deliveryIncome;
  const heldForSuppliers = rows.reduce((sum, r) => sum + r.heldAmount, 0);
  const releasedToSuppliers = payouts.reduce((sum, p) => sum + p.amount, 0);

  const heldRows = rows.filter((r) => r.heldAmount > 0);

  async function doRelease(row: EscrowRow): Promise<void> {
    const result = await releaseSupplierFunds(row.supplier.id);
    if (result.ok && result.record) {
      push({
        title: "Funds released",
        message: `${mwk(result.record.amount)} sent to ${row.supplier.name} · MedLink kept ${mwk(result.record.serviceFee)} service fee.`,
        icon: "success",
      });
    } else if (result.error) {
      push({ title: "Release failed", message: result.error, icon: "error" });
    }
    setReleaseTarget(null);
  }

  const escrowColumns: Column<EscrowRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      render: (r) => (
        <div className="row" style={{ gap: 10 }}>
          <SupplierAvatar supplier={r.supplier} size={36} />
          <div>
            <b className="small">{r.supplier.name}</b>
            <div className="xs muted">{r.supplier.category}</div>
          </div>
        </div>
      ),
    },
    {
      key: "orders",
      header: "Orders held",
      render: (r) =>
        r.orderCount === 0 ? (
          <span className="xs muted">—</span>
        ) : (
          <div>
            <b className="small">{r.orderCount}</b>
            <div className="xs muted" style={{ maxWidth: 210 }}>
              {r.orderNumbers.join(", ")}
            </div>
          </div>
        ),
    },
    {
      key: "held",
      header: "Held for supplier",
      align: "right",
      render: (r) =>
        r.heldAmount === 0 ? (
          <span className="xs muted">—</span>
        ) : (
          <div>
            <b>{mwk(r.heldAmount)}</b>
            <div className="xs muted">MedLink fee {mwk(r.serviceFee)}</div>
          </div>
        ),
    },
    {
      key: "account",
      header: "Payout account",
      render: (r) => (
        <div>
          <span className="small">{payoutAccountSummary(r.supplier.operatingAccount)}</span>
          {r.supplier.operatingAccount && (
            <div className="xs muted">{r.supplier.operatingAccount.accountName}</div>
          )}
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) =>
        r.heldAmount > 0 ? (
          <button className="btn btn-primary btn-sm" onClick={() => setReleaseTarget(r)}>
            <Send size={13} /> Release {mwkCompact(r.heldAmount)}
          </button>
        ) : (
          <span className="badge badge-green">Settled</span>
        ),
    },
  ];

  const payoutColumns: Column<(typeof payouts)[number]>[] = [
    {
      key: "release",
      header: "Release",
      render: (p) => (
        <div>
          <b className="small">{p.id.toUpperCase()}</b>
          <div className="xs muted">
            {prettyDate(p.releasedAt)} · {timeOnly(p.releasedAt)}
          </div>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (p) => <span className="small">{getSupplierById(p.supplierId)?.name ?? p.supplierId}</span>,
    },
    {
      key: "orders",
      header: "Orders settled",
      render: (p) => <span className="xs muted">{p.orderNumbers.join(", ")}</span>,
    },
    {
      key: "amount",
      header: "Released",
      align: "right",
      render: (p) => (
        <div>
          <b>{mwk(p.amount)}</b>
          <div className="xs muted">fee {mwk(p.serviceFee)}</div>
        </div>
      ),
    },
    {
      key: "account",
      header: "Sent to",
      render: (p) => <span className="small">{p.accountSummary}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: () => (
        <span className="badge badge-green">
          <ShieldCheck size={11} /> Completed
        </span>
      ),
    },
  ];

  const target = releaseTarget;
  const targetAccount = target?.supplier.operatingAccount;

  const paymentColumns: Column<PaymentTransaction>[] = [
    {
      key: "payment",
      header: "Payment",
      render: (p) => (
        <div>
          <Link to={`/admin/transactions/${p.id}`} className="link small" style={{ whiteSpace: "nowrap" }}>
            {p.id.toUpperCase()} <ArrowUpRight size={12} style={{ verticalAlign: -1 }} />
          </Link>
          <div className="xs muted">
            {prettyDate(p.paidAt)} · {timeOnly(p.paidAt)}
          </div>
        </div>
      ),
    },
    {
      key: "order",
      header: "Order",
      render: (p) =>
        p.orderId ? (
          <div>
            <b className="small" style={{ whiteSpace: "nowrap" }}>{p.orderNumber}</b>
            <div className="xs muted">
              <Link to={`/admin/orders/${p.orderId}`} className="link-muted">
                View order
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <b className="small" style={{ whiteSpace: "nowrap" }}>{p.orderNumber}</b>
            <div className="xs muted">No order created</div>
          </div>
        ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (p) => <span className="small">{p.customerName}</span>,
    },
    {
      key: "method",
      header: "Method",
      render: (p) => (
        <div>
          <span className="small">{p.method}</span>
          <div className="xs muted" style={{ maxWidth: 170 }}>
            {p.reference}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => (
        <div>
          <b>{mwk(p.amount)}</b>
          <div className="xs muted">
            fee {mwk(p.serviceFee)} + delivery {mwk(p.deliveryFee)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) =>
        p.status === "succeeded" ? (
          <span className="badge badge-green">
            <CheckCircle2 size={11} /> Succeeded
          </span>
        ) : p.status === "failed" ? (
          <span className="badge badge-red">
            <XCircle size={11} /> Failed
          </span>
        ) : (
          <span className="badge badge-amber">Refunded</span>
        ),
    },
  ];

  const payChips: { key: PayFilter; label: string }[] = [
    { key: "all", label: `All (${payments.length})` },
    { key: "succeeded", label: `Succeeded (${succeededCount})` },
    { key: "failed", label: `Failed (${failedCount})` },
  ];

  return (
    <div className="stack dash-page">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Escrow &amp; payouts</span>
          <h1 className="h-section">Transactions</h1>
          <p className="small muted">
            Buyers pay MedLink. Funds are held per supplier until delivery is confirmed, then released to the
            supplier's operating account.
          </p>
        </div>
        <Link to="/admin/orders" className="btn btn-outline btn-sm hide-mobile">
          View orders
        </Link>
      </div>

      <div className="grid grid-4 dash-grid">
        <DashboardCard icon={<ShoppingBag size={19} />} label="Paid in by buyers" value={mwk(paidIn)} sub="Goods + service fee + delivery" tone="navy" />
        <DashboardCard icon={<HandCoins size={19} />} label="MedLink revenue" value={mwk(medlinkRevenue)} sub={`${Math.round(getPricing().serviceFeeRate * 100)}% fee ${mwkCompact(serviceFeeIncome)} + delivery ${mwkCompact(deliveryIncome)}`} tone="teal" />
        <DashboardCard icon={<Lock size={19} />} label="Held for suppliers" value={mwk(heldForSuppliers)} sub={`${heldRows.length} suppliers awaiting release`} tone="amber" />
        <DashboardCard icon={<Landmark size={19} />} label="Released to suppliers" value={mwk(releasedToSuppliers)} sub={`${payouts.length} payouts all-time`} tone="green" />
      </div>

      <div className="card dash-tip">
        <ShieldCheck size={20} className="teal" />
        <p className="small muted" style={{ margin: 0 }}>
          Customer payments are held by MedLink until delivery is confirmed — this protects buyers. When you release
          funds, MedLink keeps its {Math.round(getPricing().serviceFeeRate * 100)}% service fee and the supplier's product value is sent to their operating
          (payout) account.
        </p>
      </div>

      <div className="card card-pad">
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">Escrow</span>
            <h3 className="h-card">Held funds by supplier</h3>
          </div>
          <span className="xs muted">{rows.length} suppliers</span>
        </div>
        <DataTable
          columns={escrowColumns}
          rows={rows}
          minWidth={760}
          empty="No supplier escrow to release."
        />
      </div>

      <div className="card card-pad">
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">Buyer payments</span>
            <h3 className="h-card">Payment attempts</h3>
            <p className="xs muted" style={{ marginTop: 4 }}>
              Every charge a buyer attempted through MedLink. Failed attempts never enter escrow.
            </p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {payChips.map((chip) => (
              <button
                key={chip.key}
                className={payFilter === chip.key ? "chip chip-active" : "chip"}
                onClick={() => setPayFilter(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        {filteredPayments.length === 0 ? (
          <p className="small muted">No payments in this view.</p>
        ) : (
          <DataTable
          columns={paymentColumns}
          rows={filteredPayments}
          minWidth={800}
          empty="No buyer payments recorded yet."
        />
        )}
      </div>

      <div className="card card-pad">
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">Ledger</span>
            <h3 className="h-card">Recent releases</h3>
          </div>
          <Wallet size={17} className="muted" />
        </div>
        {payouts.length === 0 ? (
          <p className="small muted">No payouts have been made yet.</p>
        ) : (
          <DataTable
          columns={payoutColumns}
          rows={payouts}
          minWidth={720}
          empty="No escrow has been released to a supplier yet."
        />
        )}
      </div>

      <Modal
        open={!!target}
        onClose={() => setReleaseTarget(null)}
        title={target ? `Release funds to ${target.supplier.name}` : "Release funds"}
        footer={
          target && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => setReleaseTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!targetAccount}
                onClick={() => doRelease(target)}
              >
                <Send size={14} /> Release {mwk(target.heldAmount)}
              </button>
            </>
          )
        }
      >
        {target && (
          <div className="stack-sm">
            <p className="small muted">
              Confirm release of escrowed buyer payments to {target.supplier.name}'s operating account. MedLink
              keeps its 10% service fee on these orders.
            </p>

            <div className="card escrow-settle">
              <div className="summary-row">
                <span>Product value (held)</span>
                <b>{mwk(target.heldAmount)}</b>
              </div>
              <div className="summary-row">
                <span>MedLink service fee (10%)</span>
                <b>{mwk(target.serviceFee)}</b>
              </div>
              <div className="summary-row">
                <span>Orders settled</span>
                <b>{target.orderCount}</b>
              </div>
              <div className="summary-row summary-total">
                <span>You send to supplier</span>
                <b>{mwk(target.heldAmount)}</b>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 6 }}>
              {target.orderNumbers.map((n) => (
                <span key={n} className="badge badge-amber">{n}</span>
              ))}
            </div>

            {targetAccount ? (
              <div className="escrow-account">
                <Landmark size={18} className="teal" />
                <div className="grow">
                  <b className="small">{targetAccount.accountName}</b>
                  <div className="xs muted">{payoutAccountSummary(targetAccount)}</div>
                  {targetAccount.branch && <div className="xs muted">Branch: {targetAccount.branch}</div>}
                  {targetAccount.mobileMoney && (
                    <div className="xs muted">Mobile money: {targetAccount.mobileMoney}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="escrow-account escrow-account-warn">
                <Landmark size={18} />
                <div>
                  <b className="small">No payout account on file</b>
                  <div className="xs muted">
                    Ask {target.supplier.name} to add their operating account before releasing funds.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}