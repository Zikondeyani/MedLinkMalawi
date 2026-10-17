import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getSupplierById, useCurrentSupplierId, useOwnApplication } from "../../lib/registry";
import { useSupplierOrders } from "../../lib/customerData";
import { useAuth } from "../../lib/auth";
import { useNotifications } from "../../lib/notifications";
import { SupplierAvatar } from "../marketplace/SupplierCard";
import KycStatusBanner from "../supplier/KycStatusBanner";
import Logo from "../ui/Logo";

const navItems = [
  { to: "/supplier", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/supplier/store", label: "Store", icon: Store },
  { to: "/supplier/products", label: "Products", icon: Package },
  { to: "/supplier/inventory", label: "Inventory", icon: Boxes },
  { to: "/supplier/orders", label: "Orders", icon: ClipboardList },
  { to: "/supplier/customers", label: "Customers", icon: Users },
  { to: "/supplier/sales", label: "Sales", icon: TrendingUp },
  { to: "/supplier/verification", label: "Verification", icon: ShieldCheck },
  { to: "/supplier/settings", label: "Store Settings", icon: Settings },
];

export default function SupplierLayout() {
  const supplierId = useCurrentSupplierId();
  const supplier = supplierId ? getSupplierById(supplierId) : undefined;
  const application = useOwnApplication();
  const orders = useSupplierOrders();
  const { user, signOut } = useAuth();
  const { unread } = useNotifications();
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();

  // Orders still waiting on the supplier to act — the same number the Orders
  // page shows, never a placeholder.
  const openOrders = orders.filter((o) => o.status === "new" || o.status === "confirmed").length;

  const signOutAndReturnHome = () => {
    signOut();
    navigate("/");
  };

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  // The sign-up trigger creates the store tenant, so this should not happen.
  // A blank dashboard would be indistinguishable from a crash, so say so.
  if (!supplier) {
    return (
      <div className="supplier-shell">
        <div className="supplier-main">
          <div className="supplier-content container">
            <div className="empty">
              <Store size={30} />
              <h1 className="h-section">No store is linked to this account yet</h1>
              <p className="muted" style={{ maxWidth: 520 }}>
                Your supplier account is active, but its store has not been created yet. This usually clears in
                a few seconds — reload the page. If it keeps happening, contact sellers@medlink.mw.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `snav-link${isActive ? " active" : ""}`;

  const Sidebar = (
    <aside className={`snav${drawer ? " snav-open" : ""}`}>
      <div className="snav-head">
        <Logo compact size={30} />
        <span className="snav-brand">
          MedLink <small>Supplier OS</small>
        </span>
        <button className="btn btn-ghost btn-icon snav-close" onClick={() => setDrawer(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="snav-store card">
        <SupplierAvatar supplier={supplier} size={42} />
        <div className="grow">
          <b className="small">{supplier.name}</b>
          {supplier.verified ? (
            <span className="badge badge-green" style={{ marginTop: 2 }}>
              <ShieldCheck size={11} /> Verified Supplier
            </span>
          ) : application?.status === "rejected" ? (
            <span className="badge badge-red" style={{ marginTop: 2 }}>KYC not approved</span>
          ) : (
            <Link to="/supplier/verification" className="badge badge-amber" style={{ marginTop: 2 }}>
              <ShieldCheck size={11} /> Verification pending
            </Link>
          )}
        </div>
      </div>

      <nav className="snav-nav" aria-label="Supplier">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setDrawer(false)}>
            <item.icon size={18} strokeWidth={1.9} />
            {item.label}
            {item.label === "Orders" && openOrders > 0 && <span className="snav-count">{openOrders}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="snav-foot">
        {/* A storefront only exists in public once the KYC is approved. */}
        {supplier.verified ? (
          <Link to={`/suppliers/${supplier.slug}`} className="snav-link" onClick={() => setDrawer(false)}>
            <ExternalLink size={15} /> View storefront
          </Link>
        ) : (
          <Link to="/supplier/verification" className="snav-link" onClick={() => setDrawer(false)}>
            <ShieldCheck size={15} /> Verification status
          </Link>
        )}
        <Link to="/" className="snav-link" onClick={() => setDrawer(false)}>
          <Store size={15} /> Back to marketplace
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="supplier-shell">
      {drawer && <div className="snav-scrim" onClick={() => setDrawer(false)} />}
      {Sidebar}

      <div className="supplier-main">
        <header className="supplier-topbar">
          <button className="btn btn-ghost btn-icon supplier-burger" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="grow">
            <span className="xs muted">Hello, {user?.name?.split(" ")[0] ?? "there"} 👋</span>
            <h2 className="small">{supplier.name}</h2>
          </div>
          <div className="supplier-topbar-actions">
            <Link to="/supplier/notifications" className="nav-icon-btn" aria-label="Notifications">
              <Bell size={19} />
              {unread > 0 && <span className="nav-badge">{unread}</span>}
            </Link>
            <button className="nav-icon-btn" onClick={signOutAndReturnHome} aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
            <Link to="/" className="btn btn-outline btn-sm">
              Marketplace
            </Link>
          </div>
        </header>

        <KycStatusBanner />

        <main className="supplier-content container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}