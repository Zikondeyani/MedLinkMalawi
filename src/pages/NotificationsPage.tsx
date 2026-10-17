import { ArrowLeft, Bell, Info, Package, Truck, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { roleLabel, useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
import { prettyDateTime } from "../lib/format";
import type { NotificationItem } from "../data/types";

const NOTIF_ICONS: Record<NotificationItem["icon"], typeof Info> = {
  package: Package,
  truck: Truck,
  wallet: Wallet,
  info: Info,
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const { items, markRead, markAllRead } = useNotifications();
  const unread = items.filter((item) => !item.read).length;
  const isAdmin = user?.role === "admin";
  const backTo = isAdmin ? "/admin" : "/supplier";

  return (
    <div className="stack dash-page">
      <Link to={backTo} className="row muted small" style={{ gap: 6, width: "fit-content" }}>
        <ArrowLeft size={14} /> Back to {isAdmin ? "admin" : "supplier"} dashboard
      </Link>

      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">{isAdmin ? "Platform" : "Supplier OS"}</span>
          <h1 className="h-section">Notifications</h1>
          <p className="small muted">
            {isAdmin ? "Operational updates for the MedLink control centre." : "Updates about incoming orders, pickups and payments."}
          </p>
        </div>
        {unread > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 14 }}>
          <h2 className="h-card row" style={{ gap: 8 }}>
            <Bell size={17} className="teal" />
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </h2>
          <span className="badge badge-soft">{roleLabel(user?.role ?? "supplier")}</span>
        </div>

        {items.length === 0 ? (
          <div className="empty faq-empty">
            <Bell size={28} className="muted" />
            <h3 className="h-card">No notifications</h3>
            <p className="small muted">You&apos;re all caught up — new updates will appear here.</p>
          </div>
        ) : (
          <div className="stack-sm">
            {items.map((item) => {
              const Icon = NOTIF_ICONS[item.icon];
              return (
                <button
                  key={item.id}
                  className={`notification-card${item.read ? "" : " unread"}`}
                  onClick={() => markRead(item.id)}
                >
                  <span className={`notif-icon notif-${item.icon}`}><Icon size={17} /></span>
                  <span className="grow">
                    <span className="between">
                      <b className="small">{item.title}</b>
                      <span className="xs muted">{prettyDateTime(item.time)}</span>
                    </span>
                    <span className="xs muted">{item.message}</span>
                  </span>
                  {!item.read && <span className="notif-dot" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
