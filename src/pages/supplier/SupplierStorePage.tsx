import { BadgeCheck, ExternalLink, FileText, Globe, Loader2, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import {
  getSupplierById,
  updateMySupplier,
  useCurrentSupplierId,
  useOwnApplication,
} from "../../lib/registry";
import { useToast } from "../../lib/toast";
import { SupplierAvatar } from "../../components/marketplace/SupplierCard";
import FileUploader from "../../components/ui/FileUploader";
import { useUploadOwner } from "../../lib/cloudinary";

export default function SupplierStorePage() {
  const supplierId = useCurrentSupplierId();
  const supplier = supplierId ? getSupplierById(supplierId) : undefined;
  const application = useOwnApplication();
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
    if (!form.name.trim()) {
      push({ title: "Store name needed", message: "A store needs a name customers can search for.", icon: "error" });
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

      <div className="card card-pad stack">
        <div>
          <h3 className="h-card">Store branding</h3>
          <p className="small muted">Preview your public store header and update its display picture and banner.</p>
        </div>
        <div className="store-branding-preview">
          <div
            className="store-branding-cover"
            style={{
              background: banner
                ? `url(${banner}) center / cover no-repeat`
                : `linear-gradient(120deg, ${supplier.bannerGradient[0]}, ${supplier.bannerGradient[1]})`,
            }}
          >
            {!banner && <div className="bg-grid-pattern" />}
          </div>
          <div className="store-branding-profile">
            <SupplierAvatar supplier={{ ...supplier, name: form.name || supplier.name, logoImage: logo ?? undefined }} size={82} />
            <div className="store-branding-identity">
              <div className="row wrap" style={{ gap: 8 }}>
                <h4 className="h-card">{form.name || supplier.name}</h4>
                {supplier.verified && <span className="badge badge-green"><BadgeCheck size={12} /> Verified</span>}
              </div>
              <span className="small muted">{supplier.category} · {supplier.location.city}</span>
            </div>
          </div>
        </div>
        <div className="form-grid">
          <div className="field full">
            <FileUploader
              purpose="store-logo"
              owner={owner}
              accept="image/png,image/jpeg,image/webp"
              label="Store display picture"
              hint="Replaces the initials on supplier cards and appears beside your store name."
              value={logo}
              round
              showPreview={false}
              maxBytes={5 * 1_048_576}
              onUploaded={(file) => {
                setLogoUrl(file.url);
                void saveStoreImage("logo_image", file.url, file.folder);
              }}
            />
          </div>
          <div className="field full">
            <FileUploader
              purpose="store-banner"
              owner={owner}
              accept="image/png,image/jpeg,image/webp"
              label="Store banner"
              hint="Shown behind your display picture on your public store page."
              value={banner}
              showPreview={false}
              maxBytes={5 * 1_048_576}
              onUploaded={(file) => {
                setBannerUrl(file.url);
                void saveStoreImage("banner_image", file.url, file.folder);
              }}
            />
          </div>
        </div>
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

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-lg" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : null}
          {saving ? "Saving…" : "Save store changes"}
        </button>
      </div>
    </div>
  );
}
