import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Heart,
  Info,
  LogOut,
  MapPin,
  Package,
  Plus,
  Settings,
  Trash2,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomerAddresses, saveCustomerAddress } from "../lib/customerData";
import { useActiveProducts } from "../lib/registry";
import { roleLabel, useAuth } from "../lib/auth";
import { useWishlist } from "../lib/wishlist";
import { useNotifications } from "../lib/notifications";
import EmptyState from "../components/ui/EmptyState";
import ProductCard from "../components/marketplace/ProductCard";
import FileUploader from "../components/ui/FileUploader";
import { describeOwnerFolder, useUploadOwner } from "../lib/cloudinary";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { prettyDateTime } from "../lib/format";
import type { DeliveryAddress, NotificationItem } from "../data/types";
import Modal from "../components/ui/Modal";

type SectionId = "saved" | "addresses" | "profile" | "settings" | "notifications";

interface SectionDef {
  id: SectionId;
  label: string;
  desc: string;
  icon: typeof User;
}

/* Account is a sectioned settings page — /account lists each section as its
   own row/card, and tapping one navigates to that section's page. Orders and
   Cart are intentionally absent: they already live in the bottom nav / top
   bar, and the customer overview moved to the home dashboard. No tabs. */
const SECTIONS: SectionDef[] = [
  { id: "saved", label: "Saved Products", desc: "Products you've saved for later", icon: Heart },
  { id: "addresses", label: "Addresses", desc: "Delivery addresses used at checkout", icon: MapPin },
  { id: "profile", label: "Profile", desc: "Your name, contact details and organisation", icon: User },
  { id: "settings", label: "Settings", desc: "Email, SMS and alert preferences", icon: Settings },
  { id: "notifications", label: "Notifications", desc: "Alerts about orders, delivery and payments", icon: Bell },
];

const NOTIF_ICONS: Record<NotificationItem["icon"], typeof Info> = {
  package: Package,
  truck: Truck,
  wallet: Wallet,
  info: Info,
};

export default function AccountPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { user, signOut, refresh } = useAuth();
  const { ids } = useWishlist();
  const { items, markRead, markAllRead } = useNotifications();
  const { push } = useToast();
  // Every file this account uploads is written to this owner's folder.
  const owner = useUploadOwner();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<DeliveryAddress>({
    fullName: user?.name ?? "",
    phone: "",
    address: "",
    city: "",
    area: "",
    instructions: "",
    label: "Delivery address",
  });

  const activeProducts = useActiveProducts();
  const savedAddresses = useCustomerAddresses(user?.email ?? "");
  const active = SECTIONS.find((s) => s.id === tab);
  const savedProducts = useMemo(
    () => ids.map((id) => activeProducts.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [ids, activeProducts],
  );

  // The route is guarded in App, but keep this page safe if it is rendered
  // directly in the future. Customer profile data must never be used as a
  // guest or non-customer fallback.
  if (!user || user.role !== "customer") return <Navigate to="/" replace />;

  const unreadCount = items.filter((n) => !n.read).length;
  const displayName = user.name;
  const displayEmail = user.email;
  const role = user.role;

  const signOutAndGoHome = () => {
    signOut();
    navigate("/");
  };

  /* ----- Section pages (/account/saved, /account/profile, ...) ----- */
  if (active) {
    return (
      <div className="page account-page container">
        <Link to="/account" className="back-link">
          <ArrowLeft size={15} /> Account
        </Link>
        <div className="page-head" style={{ paddingTop: 16 }}>
          <span className="eyebrow">Account</span>
          <h1 className="h-display" style={{ fontSize: "clamp(24px,4vw,32px)" }}>{active.label}</h1>
          <p>{active.desc}</p>
        </div>

        {active.id === "saved" &&
          (savedProducts.length === 0 ? (
            <EmptyState
              icon="box"
              title="No saved products"
              message="Tap the heart on any product to save it here."
              action={<Link to="/products" className="btn btn-primary">Discover products</Link>}
            />
          ) : (
            <div className="p-grid p-grid-4">
              {savedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ))}

        {active.id === "addresses" && (
          <div className="grid grid-2 addr-grid">
            {savedAddresses.map((a) => (
              <div key={a.id} className="card card-pad">
                <div className="between">
                  <span className="badge badge-soft">{a.label}</span>
                  {a.isDefault && <span className="badge badge-green">Default</span>}
                </div>
                <b className="small" style={{ display: "block", marginTop: 12 }}>{a.fullName}</b>
                <p className="small muted">{a.address}</p>
                <p className="small muted">{a.area}, {a.city}</p>
                <p className="xs muted">{a.phone}</p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-outline btn-sm"><Plus size={13} /> Edit</button>
                  <button className="btn btn-ghost btn-sm"><Trash2 size={13} /> Remove</button>
                </div>
              </div>
            ))}
            <button
              className="card card-hover addr-add"
              onClick={() => {
                setNewAddress({
                  fullName: user.name,
                  phone: "",
                  address: "",
                  city: "",
                  area: "",
                  instructions: "",
                  label: "Delivery address",
                });
                setAddressFormOpen(true);
              }}
            >
              <span className="addr-add-icon"><Plus size={22} /></span>
              <b className="small">Add a new address</b>
              <span className="xs muted">Clinic, hospital, home...</span>
            </button>
          </div>
        )}
        {active.id === "addresses" && (
          <Modal
            open={addressFormOpen}
            onClose={() => setAddressFormOpen(false)}
            title="Add delivery address"
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setAddressFormOpen(false)} disabled={savingAddress}>Cancel</button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  form="account-address-form"
                  disabled={savingAddress}
                >
                  {savingAddress ? "Saving..." : "Save address"}
                </button>
              </>
            }
          >
            <form
              id="account-address-form"
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                if (savingAddress) return;
                setSavingAddress(true);
                try {
                  const result = await saveCustomerAddress(
                    user.email,
                    newAddress,
                    newAddress.label || "Delivery address",
                    user.id,
                  );
                  if (!result.ok) {
                    push({ title: "Could not save address", message: result.error, icon: "error" });
                    return;
                  }
                  setAddressFormOpen(false);
                  push({ title: "Address saved", message: "You can select it during checkout.", icon: "success" });
                } catch (error) {
                  push({
                    title: "Could not save address",
                    message: error instanceof Error ? error.message : String(error),
                    icon: "error",
                  });
                } finally {
                  setSavingAddress(false);
                }
              }}
            >
              <div className="field">
                <label className="label" htmlFor="account-address-label">Label</label>
                <input
                  id="account-address-label"
                  className="input"
                  value={newAddress.label}
                  onChange={(event) => setNewAddress({ ...newAddress, label: event.target.value })}
                  placeholder="Home, Work, Clinic"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="account-address-name">Recipient name</label>
                <input
                  id="account-address-name"
                  className="input"
                  required
                  value={newAddress.fullName}
                  onChange={(event) => setNewAddress({ ...newAddress, fullName: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="account-address-phone">Phone number</label>
                <input
                  id="account-address-phone"
                  className="input"
                  required
                  value={newAddress.phone}
                  onChange={(event) => setNewAddress({ ...newAddress, phone: event.target.value })}
                  placeholder="+265 ..."
                />
              </div>
              <div className="field full">
                <label className="label" htmlFor="account-address-street">Street / plot / house</label>
                <input
                  id="account-address-street"
                  className="input"
                  required
                  value={newAddress.address}
                  onChange={(event) => setNewAddress({ ...newAddress, address: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="account-address-city">City</label>
                <input
                  id="account-address-city"
                  className="input"
                  required
                  value={newAddress.city}
                  onChange={(event) => setNewAddress({ ...newAddress, city: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="account-address-area">Area / Zone</label>
                <input
                  id="account-address-area"
                  className="input"
                  required
                  value={newAddress.area}
                  onChange={(event) => setNewAddress({ ...newAddress, area: event.target.value })}
                />
              </div>
              <div className="field full">
                <label className="label" htmlFor="account-address-instructions">Delivery instructions <span>(optional)</span></label>
                <textarea
                  id="account-address-instructions"
                  className="textarea"
                  value={newAddress.instructions}
                  onChange={(event) => setNewAddress({ ...newAddress, instructions: event.target.value })}
                />
              </div>
            </form>
          </Modal>
        )}

        {active.id === "profile" && (
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 16 }}>Profile</h2>
            <FileUploader
              purpose="profile"
              owner={owner}
              accept="image/png,image/jpeg,image/webp"
              label="Profile photo"
              round
              value={avatarUrl}
              hint={`Saved to ${describeOwnerFolder(owner, "profile")}`}
              maxBytes={5 * 1_048_576}
              onUploaded={async (file) => {
                const next = file.url;
                setAvatarUrl(next);
                if (!supabase) {
                  push({ title: "Profile photo", message: "Saved for this session only — no backend configured.", icon: "info" });
                  return;
                }
                // Only the URL is stored; the bytes live in the owner's Cloudinary folder.
                const { error } = await supabase.from("profiles").update({ avatar_url: next }).eq("id", user.id);
                if (error) {
                  push({ title: "Could not save the photo", message: error.message, icon: "error" });
                  return;
                }
                await refresh();
                push({ title: "Profile photo updated", message: `Stored in ${file.folder}`, icon: "success" });
              }}
            />
            <div className="form-grid" style={{ marginTop: 20 }}>
              <div className="field">
                <label className="label" htmlFor="pname">Full name</label>
                <input id="pname" className="input" defaultValue={user.name} />
              </div>
              <div className="field">
                <label className="label" htmlFor="pemail">Email</label>
                <input id="pemail" className="input" defaultValue={user.email} />
              </div>
              <div className="field">
                <label className="label" htmlFor="pphone">Phone</label>
                <input id="pphone" className="input" placeholder="Add your phone number" />
              </div>
              <div className="field">
                <label className="label" htmlFor="porg">Organisation</label>
                <input id="porg" className="input" placeholder="Add your organisation" />
              </div>
              <div className="field full">
                <label className="label" htmlFor="pabout">About</label>
                <textarea id="pabout" className="textarea" placeholder="Tell suppliers about your facility or purchasing needs" />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16 }}>Save changes</button>
          </div>
        )}

        {active.id === "settings" && (
          <div className="card card-pad">
            <h2 className="h-card" style={{ marginBottom: 16 }}>Preferences</h2>
            <div className="stack-sm">
              {[
                { label: "Email order updates", desc: "Receive order confirmations and status changes by email." },
                { label: "SMS delivery alerts", desc: "Get SMS alerts when your order is out for delivery." },
                { label: "Price drop notifications", desc: "Notify me when saved products change price." },
                { label: "Marketing newsletters", desc: "Occasional product recommendations and supplier news." },
              ].map((s) => (
                <div key={s.label} className="between settings-row">
                  <div>
                    <b className="small">{s.label}</b>
                    <div className="xs muted">{s.desc}</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" defaultChecked={s.label !== "Marketing newsletters"} />
                    <span className="switch-track" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {active.id === "notifications" && (
          <div className="card card-pad">
            <div className="between" style={{ marginBottom: 14 }}>
              <h2 className="h-card">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</h2>
              {unreadCount > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
              )}
            </div>
            {items.length === 0 ? (
              <EmptyState
                icon="box"
                title="No notifications"
                message="You're all caught up — updates about your orders will appear here."
              />
            ) : (
              <div className="stack-sm">
                {items.map((n) => {
                  const Icon = NOTIF_ICONS[n.icon];
                  return (
                    <button key={n.id} className={`notification-card${n.read ? "" : " unread"}`} onClick={() => markRead(n.id)}>
                      <span className={`notif-icon notif-${n.icon}`}><Icon size={17} /></span>
                      <span className="grow">
                        <span className="between">
                          <b className="small">{n.title}</b>
                          <span className="xs muted">{prettyDateTime(n.time)}</span>
                        </span>
                        <span className="xs muted">{n.message}</span>
                      </span>
                      {!n.read && <span className="notif-dot" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ----- Unknown section → back to the account hub ----- */
  if (tab) return <Navigate to="/account" replace />;

  /* ----- Account hub (/account) ----- */
  return (
    <div className="page account-page container">
      <div className="page-head">
        <span className="eyebrow">Account</span>
        <h1 className="h-display" style={{ fontSize: "clamp(24px,4vw,34px)" }}>Hello, {displayName.split(" ")[0]} 👋</h1>
        <p>{displayEmail} · {roleLabel(role)}</p>
      </div>

      <div className="acct-hub">
        <div className="card setting-group">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`/account/${s.id}`} className="setting-row">
              <span className="setting-row-icon"><s.icon size={17} /></span>
              <span className="grow">
                <b>{s.label}</b>
                <small>{s.desc}</small>
              </span>
              {s.id === "notifications" && unreadCount > 0 && (
                <span className="badge badge-teal">{unreadCount}</span>
              )}
              <ChevronRight size={17} className="muted" />
            </Link>
          ))}
        </div>

        <div className="card setting-group">
          <button className="setting-row danger" onClick={signOutAndGoHome}>
            <span className="setting-row-icon"><LogOut size={17} /></span>
            <span className="grow">
              <b>Sign out</b>
              <small>End this session</small>
            </span>
            <ChevronRight size={17} className="muted" />
          </button>
        </div>
      </div>
    </div>
  );
}