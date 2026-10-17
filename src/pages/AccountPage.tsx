import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Heart,
  Info,
  LogOut,
  Loader2,
  MapPin,
  Package,
  Plus,
  Settings,
  Save,
  Trash2,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomerAddresses, saveCustomerAddress } from "../lib/customerData";
import { useActiveProducts } from "../lib/registry";
import { roleLabel, updateLocalAccount, useAuth } from "../lib/auth";
import { useWishlist } from "../lib/wishlist";
import { useNotifications } from "../lib/notifications";
import EmptyState from "../components/ui/EmptyState";
import ProductCard from "../components/marketplace/ProductCard";
import FileUploader from "../components/ui/FileUploader";
import { describeOwnerFolder, useUploadOwner } from "../lib/cloudinary";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { prettyDateTime } from "../lib/format";
import type { DeliveryAddress, NotificationItem, RefundAccount } from "../data/types";
import Modal from "../components/ui/Modal";
import { deleteRefundAccount, saveRefundAccount, useRefundAccounts } from "../lib/refunds";

type SectionId = "saved" | "addresses" | "refunds" | "profile" | "settings" | "notifications";

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
  { id: "refunds", label: "Refund Accounts", desc: "Where MedLink can send refunds for cancelled items", icon: Wallet },
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
  const { ids, loading: wishlistLoading } = useWishlist();
  const { items, markRead, markAllRead, deleteNotification, clearAll, loading: notificationsLoading, markingId, markingAll, deletingId, clearing } = useNotifications();
  const { push } = useToast();
  // Every file this account uploads is written to this owner's folder.
  const owner = useUploadOwner();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    organization: user?.organization ?? "",
    about: user?.about ?? "",
  });
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
  const { accounts: refundAccounts, loading: refundsLoading, error: refundsError, reload: reloadRefundAccounts } = useRefundAccounts(user?.id);
  const [refundFormOpen, setRefundFormOpen] = useState(false);
  const [savingRefundAccount, setSavingRefundAccount] = useState(false);
  const [refundAccountDraft, setRefundAccountDraft] = useState<Omit<RefundAccount, "id">>({
    label: "",
    method: "mobile_money",
    provider: "",
    accountName: "",
    accountNumber: "",
  });
  const active = SECTIONS.find((s) => s.id === tab);
  const savedProducts = useMemo(
    () => ids.map((id) => activeProducts.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [ids, activeProducts],
  );

  useEffect(() => {
    if (!user) return;
    setProfileDraft({
      name: user.name,
      phone: user.phone ?? "",
      organization: user.organization ?? "",
      about: user.about ?? "",
    });
    setAvatarUrl(user.avatarUrl ?? null);
  }, [user]);

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
          (wishlistLoading ? (
            <div className="card card-pad row" role="status" style={{ justifyContent: "center", gap: 10 }}>
              <Loader2 size={18} className="spin" /> Loading saved products...
            </div>
          ) : savedProducts.length === 0 ? (
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
        {active.id === "refunds" && (
          <div className="stack">
            <div className="card card-pad">
              <div className="between wrap" style={{ gap: 12 }}>
                <div>
                  <h2 className="h-card">Saved refund accounts</h2>
                  <p className="xs muted" style={{ marginTop: 5 }}>
                    MedLink uses these details only when a supplier cancels items and you request a refund.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setRefundAccountDraft({ label: "", method: "mobile_money", provider: "", accountName: user.name, accountNumber: "" });
                    setRefundFormOpen(true);
                  }}
                >
                  <Plus size={14} /> Add account
                </button>
              </div>
              {refundsError && <p className="small" role="alert" style={{ color: "var(--red, #b42318)", marginTop: 12 }}>{refundsError}</p>}
              {refundsLoading ? (
                <p className="small muted row" role="status" style={{ marginTop: 18, gap: 8 }}><Loader2 size={16} className="spin" /> Loading refund accounts...</p>
              ) : refundAccounts.length === 0 ? (
                <p className="small muted" style={{ marginTop: 18 }}>No refund accounts saved yet. Add a Mobile Money or bank account to receive refunds.</p>
              ) : (
                <div className="grid grid-2" style={{ marginTop: 16 }}>
                  {refundAccounts.map((account) => (
                    <div className="card card-pad" key={account.id}>
                      <div className="between" style={{ gap: 10 }}>
                        <span className="badge badge-soft">{account.label}</span>
                        <button
                          className="btn btn-ghost btn-sm"
                          aria-label={`Remove ${account.label}`}
                          onClick={async () => {
                            const result = await deleteRefundAccount(account.id);
                            if (!result.ok) {
                              push({ title: "Could not remove account", message: result.error ?? "The account could not be removed.", icon: "error" });
                              return;
                            }
                            await reloadRefundAccounts();
                            push({ title: "Refund account removed", message: "The saved account was removed.", icon: "success" });
                          }}
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                      <b className="small" style={{ display: "block", marginTop: 12 }}>{account.provider}</b>
                      <p className="small muted">{account.accountName}</p>
                      <p className="small">{account.accountNumber}</p>
                      <span className="xs muted">{account.method === "mobile_money" ? "Mobile Money" : "Bank account"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Modal
              open={refundFormOpen}
              onClose={() => setRefundFormOpen(false)}
              title="Add refund account"
              footer={
                <>
                  <button className="btn btn-ghost" onClick={() => setRefundFormOpen(false)} disabled={savingRefundAccount}>Cancel</button>
                  <button className="btn btn-primary" type="submit" form="refund-account-form" disabled={savingRefundAccount}>
                    {savingRefundAccount ? "Saving..." : "Save account"}
                  </button>
                </>
              }
            >
              <form
                id="refund-account-form"
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (savingRefundAccount) return;
                  setSavingRefundAccount(true);
                  const result = await saveRefundAccount(user.id, refundAccountDraft);
                  setSavingRefundAccount(false);
                  if (!result.ok) {
                    push({ title: "Could not save account", message: result.error ?? "The account could not be saved.", icon: "error" });
                    return;
                  }
                  setRefundFormOpen(false);
                  await reloadRefundAccounts();
                  push({ title: "Refund account saved", message: "You can select it when requesting an order refund.", icon: "success" });
                }}
              >
                <div className="field full">
                  <label className="label" htmlFor="refund-label">Account label</label>
                  <input id="refund-label" className="input" required value={refundAccountDraft.label} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, label: event.target.value })} placeholder="e.g. Personal Airtel Money" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="refund-method">Account type</label>
                  <select id="refund-method" className="input" value={refundAccountDraft.method} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, method: event.target.value as RefundAccount["method"], provider: "" })}>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank_account">Bank account</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="refund-provider">{refundAccountDraft.method === "mobile_money" ? "Mobile Money provider" : "Bank name"}</label>
                  {refundAccountDraft.method === "mobile_money" ? (
                    <select id="refund-provider" className="input" required value={refundAccountDraft.provider} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, provider: event.target.value })}>
                      <option value="">Select provider</option>
                      <option value="Airtel Money">Airtel Money</option>
                      <option value="TNM Mpamba">TNM Mpamba</option>
                      <option value="Other Mobile Money">Other</option>
                    </select>
                  ) : (
                    <input id="refund-provider" className="input" required value={refundAccountDraft.provider} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, provider: event.target.value })} placeholder="Bank name" />
                  )}
                </div>
                <div className="field">
                  <label className="label" htmlFor="refund-account-name">Account holder name</label>
                  <input id="refund-account-name" className="input" required value={refundAccountDraft.accountName} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, accountName: event.target.value })} />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="refund-account-number">{refundAccountDraft.method === "mobile_money" ? "Mobile Money number" : "Account number"}</label>
                  <input id="refund-account-number" className="input" required value={refundAccountDraft.accountNumber} onChange={(event) => setRefundAccountDraft({ ...refundAccountDraft, accountNumber: event.target.value })} />
                </div>
              </form>
            </Modal>
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
            {avatarSaving && <p className="xs muted row" role="status" style={{ gap: 7, marginBottom: 10 }}><Loader2 size={14} className="spin" /> Saving profile photo...</p>}
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
                if (!supabase) {
                  const updated = updateLocalAccount(user.id, { avatarUrl: next });
                  if (!updated) {
                    push({ title: "Could not save the photo", message: "Could not find the local account to update.", icon: "error" });
                    return;
                  }
                  setAvatarUrl(next);
                  await refresh();
                  push({ title: "Profile photo updated", message: "Your profile photo has been saved locally.", icon: "success" });
                  return;
                }
                setAvatarSaving(true);
                try {
                  const { data, error } = await supabase.from("profiles").update({ avatar_url: next }).eq("id", user.id).select("id").maybeSingle();
                  if (error) throw error;
                  if (!data) throw new Error("Profile was not found or the photo could not be saved.");
                  setAvatarUrl(next);
                  await refresh();
                  push({ title: "Profile photo updated", message: "Your profile photo has been saved.", icon: "success" });
                } catch (error) {
                  push({ title: "Could not save the photo", message: error instanceof Error ? error.message : String(error), icon: "error" });
                } finally {
                  setAvatarSaving(false);
                }
              }}
            />
            <form
              className="form-grid"
              style={{ marginTop: 20 }}
              onSubmit={async (event) => {
                event.preventDefault();
                if (profileSaving) return;
                setProfileSaving(true);
                try {
                  if (supabase) {
                    const { data, error } = await supabase
                      .from("profiles")
                      .update({
                        full_name: profileDraft.name.trim(),
                        phone: profileDraft.phone.trim() || null,
                        organization: profileDraft.organization.trim(),
                        about: profileDraft.about.trim(),
                      })
                      .eq("id", user.id)
                      .select("id")
                      .maybeSingle();
                    if (error) throw error;
                    if (!data) throw new Error("Profile was not found or you do not have permission to update it.");
                    await refresh();
                  } else {
                    const updated = updateLocalAccount(user.id, {
                      name: profileDraft.name.trim(),
                      phone: profileDraft.phone.trim(),
                      organization: profileDraft.organization.trim(),
                      about: profileDraft.about.trim(),
                    });
                    if (!updated) throw new Error("Could not find the local account to update.");
                    await refresh();
                  }
                  push({ title: "Profile saved", message: "Your account details have been updated.", icon: "success" });
                } catch (error) {
                  push({ title: "Could not save profile", message: error instanceof Error ? error.message : String(error), icon: "error" });
                } finally {
                  setProfileSaving(false);
                }
              }}
            >
              <div className="field">
                <label className="label" htmlFor="pname">Full name</label>
                <input id="pname" className="input" required value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="pemail">Email</label>
                <input id="pemail" className="input" value={user.email} readOnly />
              </div>
              <div className="field">
                <label className="label" htmlFor="pphone">Phone</label>
                <input id="pphone" className="input" value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} placeholder="Add your phone number" />
              </div>
              <div className="field">
                <label className="label" htmlFor="porg">Organisation</label>
                <input id="porg" className="input" value={profileDraft.organization} onChange={(event) => setProfileDraft({ ...profileDraft, organization: event.target.value })} placeholder="Add your organisation" />
              </div>
              <div className="field full">
                <label className="label" htmlFor="pabout">About</label>
                <textarea id="pabout" className="textarea" value={profileDraft.about} onChange={(event) => setProfileDraft({ ...profileDraft, about: event.target.value })} placeholder="Tell suppliers about your facility or purchasing needs" />
              </div>
              <div className="field full">
                <button className="btn btn-primary" type="submit" style={{ marginTop: 4 }} disabled={profileSaving}>
                  {profileSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  {profileSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
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
              <div className="row wrap" style={{ gap: 6 }}>
                {unreadCount > 0 && (
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
            {notificationsLoading ? (
              <div className="row muted small" role="status" style={{ justifyContent: "center", gap: 8, padding: 18 }}><Loader2 size={17} className="spin" /> Loading notifications...</div>
            ) : items.length === 0 ? (
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
                    <div key={n.id} className="notification-row">
                      <button className={`notification-card${n.read ? "" : " unread"}`} disabled={deletingId === n.id || markingId === n.id || clearing} onClick={() => void markRead(n.id)}>
                        <span className={`notif-icon notif-${n.icon}`}><Icon size={17} /></span>
                        <span className="grow">
                          <span className="between">
                            <b className="small">{n.title}</b>
                            <span className="xs muted">{prettyDateTime(n.time)}</span>
                          </span>
                          <span className="xs muted">{n.message}</span>
                        </span>
                        {markingId === n.id ? <Loader2 size={14} className="spin muted" /> : !n.read && <span className="notif-dot" />}
                      </button>
                      <button className="btn btn-ghost btn-icon notification-delete" aria-label={`Delete notification: ${n.title}`} title="Delete notification" disabled={clearing || !!markingId || markingAll || deletingId === n.id} onClick={() => void deleteNotification(n.id)}>
                        {deletingId === n.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
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