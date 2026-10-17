import { BadgeCheck, Camera, ExternalLink, FileText, Globe, Loader2, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import {
  getSupplierById,
  updateMySupplier,
  useCurrentSupplierId,
  useOwnApplication,
  usePricing,
} from "../../lib/registry";
import { useToast } from "../../lib/toast";
import { SupplierAvatar } from "../../components/marketplace/SupplierCard";
import FileUploader from "../../components/ui/FileUploader";
import { describeOwnerFolder, useUploadOwner } from "../../lib/cloudinary";

export default function SupplierStorePage() {
  const supplierId = useCurrentSupplierId();
  const supplier = supplierId ? getSupplierById(supplierId) : undefined;
  const application = useOwnApplication();
  const pricing = usePricing();
  const { push } = useToast();
  // Store artwork is written to this store's own folder, never a shared one.
  const owner = useUploadOwner();

  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    description: supplier?.description ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    city: supplier?.location.city ?? "Lilongwe",
    area: supplier?.location.area ?? "",
    deliveryFee: String(supplier?.delivery.fee ?? 0),
    estimate: supplier?.delivery.estimate ?? "",
  });

  if (!supplier) return null;

  const banner = bannerUrl ?? supplier.bannerImage ?? null;
  const logo = logoUrl ?? supplier.logoImage ?? null;

  /** Store the uploaded Cloudinary URL on this store's row (bytes stay in Cloudinary). */
  async function saveStoreImage(column: "banner_image" | "logo_image", url: string, folder: string) {
    const result = await updateMySupplier(
      column === "banner_image" ? { bannerImage: url } : { logoImage: url },
    );
    if (!result.ok) {
      push({
        title: "Image uploaded but not linked",
        message: `${result.error ?? "The store row could not be updated."} The file is safe in ${folder}.`,
        icon: "error",
      });
      return;
    }
    push({ title: "Store image updated", message: `Stored in ${folder}`, icon: "success" });
  }

  async function save() {
    const fee = Number(form.deliveryFee);
    if (!form.name.trim()) {
      push({ title: "Store name needed", message: "A store needs a name customers can search for.", icon: "error" });
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      push({ title: "Check the delivery fee", message: "Enter a delivery fee of 0 or more.", icon: "error" });
      return;
    }

    setSaving(true);
    const result = await updateMySupplier({
      name: form.name,
      description: form.description,
      phone: form.phone,
      email: form.email,
      city: form.city,
      area: form.area,
      deliveryFee: Math.round(fee),
      deliveryEstimate: form.estimate,
    });
    setSaving(false);

    if (!result.ok) {
      push({ title: "Not saved", message: result.error ?? "The server rejected the change.", icon: "error" });
      return;
    }
    push({ title: "Store updated", message: "Your store information has been saved.", icon: "success" });
  }

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Storefront</span>
          <h1 className="h-section">Store</h1>
          <p className="small muted">Manage how your store appears to customers on the marketplace.</p>
        </div>
        {supplier.verified && (
          <span className="badge badge-green"><BadgeCheck size={13} /> Verified Supplier</span>
        )}
      </div>

      {/* Banner + logo — both upload into this store's folder */}
      <div className="store-preview">
        <div
          className="store-preview-banner"
          style={
            banner
              ? {
                  backgroundImage: `url(${banner})`,
                  backgroundSize: "contain",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundColor: supplier.bannerGradient[0],
                }
              : { background: `linear-gradient(120deg, ${supplier.bannerGradient[0]}, ${supplier.bannerGradient[1]})` }
          }
        >
          {!banner && <div className="bg-grid-pattern" />}
          <div className="store-preview-actions">
            <span className="btn btn-outline btn-sm">
              <Camera size={14} />
              <FileUploader
                purpose="store-banner"
                owner={owner}
                accept="image/png,image/jpeg,image/webp"
                label="Store banner"
                value={banner}
                maxBytes={5 * 1_048_576}
                onUploaded={(file) => {
                  setBannerUrl(file.url);
                  void saveStoreImage("banner_image", file.url, file.folder);
                }}
              />
            </span>
          </div>
        </div>
        <div className="store-preview-head">
          {logo ? (
            <img src={logo} alt="" style={{ width: 68, height: 68, borderRadius: "50%", objectFit: "contain", background: "#fff" }} />
          ) : (
            <SupplierAvatar supplier={supplier} size={68} />
          )}
          <div className="grow">
            <h2 className="h-card">{supplier.name}</h2>
            {supplier.verified && (
              <span className="badge badge-green" style={{ marginTop: 2 }}><BadgeCheck size={11} /> Verified Supplier</span>
            )}
          </div>
          <FileUploader
            purpose="store-logo"
            owner={owner}
            accept="image/png,image/jpeg,image/webp"
            label="Change logo"
            value={logo}
            maxBytes={5 * 1_048_576}
            onUploaded={(file) => {
              setLogoUrl(file.url);
              void saveStoreImage("logo_image", file.url, file.folder);
            }}
          />
        </div>
        <p className="xs muted" style={{ padding: "0 16px 14px" }}>
          Banner goes to <code>{describeOwnerFolder(owner, "store-banner")}</code>, logo to{" "}
          <code>{describeOwnerFolder(owner, "store-logo")}</code>.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="h-card" style={{ marginBottom: 16 }}>Store information</h3>
        <div className="form-grid">
          <div className="field full">
            <label className="label" htmlFor="sname">Store name</label>
            <input id="sname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field full">
            <label className="label" htmlFor="sdesc">Description</label>
            <textarea id="sdesc" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sphone"><Phone size={13} className="muted" /> Phone</label>
            <input id="sphone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="semail"><Globe size={13} className="muted" /> Email</label>
            <input id="semail" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="scity"><MapPin size={13} className="muted" /> City</label>
            <input id="scity" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sarea">Area / Zone</label>
            <input id="sarea" className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Registration details come from the KYC application, not this form. */}
      <div className="card card-pad">
        <h3 className="h-card" style={{ marginBottom: 12 }}>Business registration</h3>
        {application ? (
          <>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="sref">Application reference</label>
                <input id="sref" className="input" value={application.ref} readOnly />
              </div>
              <div className="field">
                <label className="label" htmlFor="sreg">Registration number</label>
                <input id="sreg" className="input" value={application.registrationNumber} readOnly />
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
              {application.documents.map((doc) => (
                doc.url ? (
                  <a key={doc.label} className="btn btn-outline btn-sm" href={doc.url} target="_blank" rel="noreferrer">
                    <FileText size={14} /> {doc.label} <ExternalLink size={12} />
                  </a>
                ) : null
              ))}
            </div>
            <p className="xs muted" style={{ marginTop: 10 }}>
              These details are fixed by your KYC submission. Ask MedLink support to correct anything that is wrong.
            </p>
          </>
        ) : (
          <p className="small muted">
            No KYC application is linked to this account, so there are no registration details to show.
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="h-card" style={{ marginBottom: 16 }}>Delivery information</h3>
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="dfee">Delivery fee (MWK)</label>
            <input id="dfee" className="input" type="number" min={0} value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="dest">Estimated delivery</label>
            <input id="dest" className="input" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} placeholder="1–2 days" />
          </div>
        </div>
        <p className="xs muted" style={{ marginTop: 10 }}>
          MedLink collects orders from your store and handles all customer delivery. Customers pay a{" "}
          {Math.round(pricing.serviceFeeRate * 1000) / 10}% MedLink service fee plus a delivery fee on every
          order — there are no free delivery thresholds.
        </p>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-lg" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : null}
          {saving ? "Saving…" : "Save store changes"}
        </button>
      </div>
    </div>
  );
}
