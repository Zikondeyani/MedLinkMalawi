import { ArrowLeft, Bell, Info, Loader2, Package, Trash2, Truck, Wallet } from "lucide-react";
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
  const { items, markRead, markAllRead, deleteNotification, clearAll, loading, markingId, markingAll, deletingId, clearing } = useNotifications();
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
        <div className="row wrap" style={{ gap: 7 }}>
          {unread > 0 && (
            <button className="btn btn-ghost btn-sm" disabled={markingAll || !!markingId || clearing} onClick={() => void markAllRead()}>
              {markingAll && <Loader2 size={14} className="spin" />}
              {markingAll ? "Marking..." : "Mark all read"}
            </button>
          )}
          {items.length > 0 && (
            <button className="btn btn-outline btn-sm" disabled={clearing || !!deletingId} onClick={() => {
              if (window.confirm("Delete all notifications in your list? This cannot be undone.")) void clearAll();
            }}>
              {clearing ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              {clearing ? "Clearing..." : "Clear all"}
            </button>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 14 }}>
          <h2 className="h-card row" style={{ gap: 8 }}>
            <Bell size={17} className="teal" />
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </h2>
          <span className="badge badge-soft">{roleLabel(user?.role ?? "supplier")}</span>
        </div>

        {loading ? (
          <div className="row muted small" role="status" style={{ justifyContent: "center", gap: 8, padding: 18 }}>
            <Loader2 size={17} className="spin" /> Loading notifications...
          </div>
        ) : items.length === 0 ? (
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
                <div key={item.id} className="notification-row">
                  <button
                    className={`notification-card${item.read ? "" : " unread"}`}
                    disabled={deletingId === item.id || markingId === item.id || clearing}
                    onClick={() => void markRead(item.id)}
                  >
                    <span className={`notif-icon notif-${item.icon}`}><Icon size={17} /></span>
                    <span className="grow">
                      <span className="between">
                        <b className="small">{item.title}</b>
                        <span className="xs muted">{prettyDateTime(item.time)}</span>
                      </span>
                      <span className="xs muted">{item.message}</span>
                    </span>
                    {markingId === item.id ? <Loader2 size={14} className="spin muted" /> : !item.read && <span className="notif-dot" />}
                  </button>
                  <button className="btn btn-ghost btn-icon notification-delete" aria-label={`Delete notification: ${item.title}`} title="Delete notification" disabled={clearing || !!markingId || markingAll || deletingId === item.id} onClick={() => void deleteNotification(item.id)}>
                    {deletingId === item.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
