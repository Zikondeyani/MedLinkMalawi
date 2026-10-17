import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronDown, LayoutDashboard, LogIn, LogOut, Menu, Package, PackageSearch, Search, ShieldCheck, ShoppingCart, Store, User, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useCategories } from "../../lib/registry";
import { useCart } from "../../lib/cart";
import { useNotifications } from "../../lib/notifications";
import { roleLabel, useAuth } from "../../lib/auth";
import Logo from "../ui/Logo";
import SearchBar from "../ui/SearchBar";
import SignInModal from "../auth/SignInModal";
import { initials } from "../../lib/format";

export default function Navbar() {
  const { summary } = useCart();
  const { unread } = useNotifications();
  const cats = useCategories();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(location.pathname);

  /* Any navigation closes the mobile curtain and the inline search bar,
     even if a link inside the menu was tapped without closing first. */
  useEffect(() => {
    if (prevPathRef.current === location.pathname) return;
    prevPathRef.current = location.pathname;
    setMobileOpen(false);
    setMobileSearch(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " nav-link-active" : ""}`;

  /* Role-specific dashboard link shown in the top bar, dropdown and mobile menu. */
  const dashboardLink = user
    ? user.role === "customer"
      ? { to: "/", label: "Dashboard", icon: <LayoutDashboard size={15} /> }
      : user.role === "supplier"
      ? { to: "/supplier", label: "Supplier dashboard", icon: <LayoutDashboard size={15} /> }
      : user.role === "admin"
        ? { to: "/admin", label: "Admin dashboard", icon: <ShieldCheck size={15} /> }
        : null
    : null;
  const notificationLink = user
    ? user.role === "customer"
      ? "/account/notifications"
      : user.role === "supplier"
        ? "/supplier/notifications"
        : "/admin/notifications"
    : null;

  return (
    <>
    <header className="nav">
      <div className="nav-top">
        <div className="container between">
          <span className="nav-top-msg">
            <PackageSearch size={13} /> Connecting Healthcare. Delivering Better.
          </span>
          <div className="nav-top-links">
            {user?.role !== "supplier" && user?.role !== "admin" && (
              <Link to="/become-a-supplier">Become a supplier</Link>
            )}
            <Link to="/faq">Help & FAQs</Link>
          </div>
        </div>
      </div>

      <div className="nav-main container">
        <Logo />

        <div className="nav-search">
          <SearchBar variant="nav" />
        </div>

        <nav className="nav-links" aria-label="Main">
          {user?.role === "customer" && (
            <NavLink to="/" end className={navLink}>
              Dashboard
            </NavLink>
          )}
          <div className="nav-dropdown" ref={catRef}>
            <button className={`nav-link${catOpen ? " nav-link-active" : ""}`} onClick={() => setCatOpen((v) => !v)}>
              Categories <ChevronDown size={14} />
            </button>
            {catOpen && (
              <div className="nav-drop-panel card">
                <div className="nav-drop-grid">
                  {cats.map((c) => (
                    <Link key={c.id} to={`/categories/${c.slug}`} onClick={() => setCatOpen(false)}>
                      <span>{c.name}</span>
                      <small>{c.productCount}</small>
                    </Link>
                  ))}
                </div>
                <Link to="/products" className="nav-drop-all" onClick={() => setCatOpen(false)}>
                  Browse all products →
                </Link>
              </div>
            )}
          </div>
          <NavLink to="/products" className={navLink}>
            Products
          </NavLink>
          <NavLink to="/suppliers" className={navLink}>
            Suppliers
          </NavLink>
          {user?.role === "customer" && (
            <NavLink to="/orders" className={navLink}>
              Orders
            </NavLink>
          )}
        </nav>

        <div className="nav-actions">
          <button className="nav-icon-btn nav-search-mobile" aria-label="Search" onClick={() => setMobileSearch((v) => !v)}>
            <Search size={19} />
          </button>

          {notificationLink && (
            <Link to={notificationLink} className="nav-icon-btn" aria-label="Notifications">
              <Bell size={19} />
              {unread > 0 && <span className="nav-badge">{unread}</span>}
            </Link>
          )}

          <Link to="/cart" className="nav-icon-btn nav-cart-btn" aria-label="Cart">
            <ShoppingCart size={19} />
            {summary.items > 0 && (
              <span key={summary.items} className="nav-badge cart-bump">
                {summary.items}
              </span>
            )}
          </Link>

          <div className="nav-dropdown" ref={acctRef}>
            {user ? (
              <>
                <button className="nav-account" onClick={() => setAccountOpen((v) => !v)}>
                  <span className="nav-avatar">{initials(user.name)}</span>
                  <span className="nav-account-name">{user.name.split(" ")[0]}</span>
                  <ChevronDown size={14} className="muted" />
                </button>
                {accountOpen && (
                  <div className="nav-drop-panel card nav-account-panel">
                    <div className="nav-account-head">
                      <b>{user.name}</b>
                      <small className="muted">{user.email}</small>
                      <span className={`badge ${user.role === "admin" ? "badge-amber" : user.role === "supplier" ? "badge-green" : "badge-soft"}`} style={{ marginTop: 6 }}>
                        {roleLabel(user.role)}
                      </span>
                    </div>

                    {/* ----- Customer menu ----- */}
                    {user.role === "customer" && (
                      <>
                        <Link to="/" onClick={() => setAccountOpen(false)}>
                          <LayoutDashboard size={15} /> Dashboard
                        </Link>
                        <Link to="/account" onClick={() => setAccountOpen(false)}>
                          <User size={15} /> My account
                        </Link>
                      </>
                    )}

                    {/* ----- Supplier menu ----- */}
                    {user.role === "supplier" && (
                      <>
                        <Link to="/supplier" onClick={() => setAccountOpen(false)}>
                          <LayoutDashboard size={15} /> Supplier dashboard
                        </Link>
                        <div className="nav-account-sep" />
                        <Link to="/" onClick={() => setAccountOpen(false)}>
                          <Store size={15} /> Back to marketplace
                        </Link>
                      </>
                    )}

                    {/* ----- Admin menu ----- */}
                    {user.role === "admin" && (
                      <>
                        <Link to="/admin" onClick={() => setAccountOpen(false)}>
                          <ShieldCheck size={15} /> Admin dashboard
                        </Link>
                        <div className="nav-account-sep" />
                        <Link to="/" onClick={() => setAccountOpen(false)}>
                          <Store size={15} /> Back to marketplace
                        </Link>
                      </>
                    )}

                    <button
                      className="nav-account-signout"
                      onClick={() => {
                        signOut();
                        setAccountOpen(false);
                      }}
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button className="nav-account nav-account-signin" onClick={() => setSignInOpen(true)}>
                <LogIn size={16} />
                <span className="nav-account-name">Sign in</span>
              </button>
            )}
          </div>

          <button className="nav-burger" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
        </div>
      </div>

      {mobileSearch && (
        <div className="nav-mobile-search container">
          <SearchBar
            variant="hero"
            placeholder="Search medical equipment, suppliers..."
            autoFocus
            initial=""
          />
        </div>
      )}

      {/* Mobile menu — portaled to <body> so it is anchored to the viewport
          wherever the page is scrolled (fixed inside the sticky navbar would
          pin it to the navbar/document top instead). */}
      {createPortal(
        <>
          {mobileOpen && <div className="nav-menu-scrim" onClick={() => setMobileOpen(false)} />}
          {mobileOpen && (
            <div className="nav-menu" role="dialog" aria-modal="true" aria-label="Mobile menu">
          <div className="nav-menu-inner container">
            <div className="nav-menu-head">
              <span className="nav-menu-title">Menu</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <button
              className="nav-menu-search"
              onClick={() => {
                setMobileOpen(false);
                setMobileSearch(true);
              }}
            >
              <Search size={16} /> Search medical equipment...
            </button>

            <nav aria-label="Mobile">
              <Link to="/products" onClick={() => setMobileOpen(false)}>
                <Package size={16} /> All products
              </Link>
              <Link to="/suppliers" onClick={() => setMobileOpen(false)}>
                <Store size={16} /> Suppliers
              </Link>
              <Link to="/cart" onClick={() => setMobileOpen(false)}>
                <ShoppingCart size={16} /> Cart {summary.items > 0 && `(${summary.items})`}
              </Link>
              {user?.role !== "supplier" && user?.role !== "admin" && (
                <Link to="/become-a-supplier" onClick={() => setMobileOpen(false)}>
                  Become a supplier
                </Link>
              )}
              <Link to="/faq" onClick={() => setMobileOpen(false)}>
                Help & FAQs
              </Link>
              {user?.role === "customer" && (
                <>
                  <Link to="/" onClick={() => setMobileOpen(false)}>
                    <LayoutDashboard size={16} /> Dashboard
                  </Link>
                  <Link to="/orders" onClick={() => setMobileOpen(false)}>
                    <Package size={16} /> Orders
                  </Link>
                  <Link to="/account" onClick={() => setMobileOpen(false)}>
                    <User size={16} /> Account
                  </Link>
                </>
              )}
              {user && dashboardLink && (
                <Link to={dashboardLink.to} onClick={() => setMobileOpen(false)}>
                  {dashboardLink.icon} {dashboardLink.label}
                </Link>
              )}
              {user && notificationLink && (
                <Link to={notificationLink} onClick={() => setMobileOpen(false)}>
                  <Bell size={16} /> Notifications {unread > 0 && `(${unread})`}
                </Link>
              )}
            </nav>

            {user ? (
              <div className="nav-menu-auth">
                <div className="nav-menu-user">
                  <span className="nav-avatar">{initials(user.name)}</span>
                  <div className="grow">
                    <b>{user.name}</b>
                    <small className="muted">{user.email}</small>
                  </div>
                </div>
                <button
                  className="nav-menu-action nav-menu-signout"
                  onClick={() => {
                    signOut();
                    setMobileOpen(false);
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            ) : (
              <button
                className="nav-menu-action nav-menu-signin"
                onClick={() => {
                  setMobileOpen(false);
                  setSignInOpen(true);
                }}
              >
                <LogIn size={16} /> Sign in
              </button>
            )}

            <p className="nav-menu-label">Categories</p>
            <div className="nav-menu-cats">
              {cats.map((c) => (
                <Link
                  key={c.id}
                  to={`/categories/${c.slug}`}
                  className="chip"
                  onClick={() => setMobileOpen(false)}
                >
                  {c.name}
                </Link>
              ))}
            </div>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </header>
    </>
  );
}