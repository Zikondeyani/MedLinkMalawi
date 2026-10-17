import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, Clock, Headset, Loader2, Mail, Phone, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { KycStatus } from "../../data/types";
import { useAuth } from "../../lib/auth";
import { shortDate } from "../../lib/format";
import {
  loadMarketplace,
  useDataStatus,
  useOwnApplication,
} from "../../lib/registry";
import {
  createSupplierApplication,
  resubmitSupplierApplication,
  type SupplierApplicationInput,
} from "../../lib/onboarding";
import { useToast } from "../../lib/toast";
import SupplierKycWizard, {
  kycDocsFromApplication,
  kycFormFromApplication,
} from "../../components/supplier/SupplierKycWizard";
import { kycStatusLabel, kycStatusTone } from "../../components/supplier/KycStatusBanner";

/**
 * The supplier's own KYC page.
 *
 * A supplier account can exist without an application (an admin created it)
 * and an application can be in any of three states, so this page shows the
 * right thing for each:
 *
 *   no application → show the sign-up submission being linked to the account
 *   pending        → read-only, so documents cannot change mid-review
 *   rejected       → the same wizard, pre-filled with what they sent, and a
 *                    resubmit that puts the row back in the queue
 *   approved       → nothing to do
 */
export default function SupplierVerificationPage() {
  const { user } = useAuth();
  const { loading, error } = useDataStatus();
  const application = useOwnApplication();
  const { push } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [justResubmitted, setJustResubmitted] = useState(false);

  // A supplier account always has a KYC row once the sign-up trigger has
  // claimed it; until the first load settles we must not flash "no application".
  const status: KycStatus | "none" = application?.status ?? "none";

  const initialForm = useMemo(
    () => (application ? kycFormFromApplication(application) : undefined),
    [application],
  );
  const initialDocs = useMemo(
    () => (application ? kycDocsFromApplication(application.documents) : undefined),
    [application],
  );

  async function handleSubmit(input: SupplierApplicationInput) {
    setSubmitting(true);

    // A supplier account can exist without a KYC row (an admin created it).
    // Then this is a first application, not a resubmission — and it is
    // linked to the account straight away instead of waiting for a trigger.
    if (!application) {
      const created = await createSupplierApplication(input);
      setSubmitting(false);
      if (created.status !== "submitted") {
        push({
          title: "Application not stored",
          message: created.status === "error" ? created.error : "The MedLink server is not reachable right now.",
          icon: "error",
        });
        return;
      }
      await loadMarketplace();
      setJustResubmitted(true);
      push({
        title: "Application submitted",
        message: `Reference ${created.application.ref} — our team will review it shortly.`,
        icon: "success",
      });
      return;
    }

    const result = await resubmitSupplierApplication(application.id, input);
    setSubmitting(false);

    if (result.status !== "resubmitted") {
      push({ title: "Resubmission failed", message: result.error, icon: "error" });
      return;
    }

    // Pull the server's row back into the registry so the banner on every
    // other page updates without a reload.
    await loadMarketplace();
    setJustResubmitted(true);
    push({
      title: "Back with the review team",
      message: "Your corrected application is in the queue again. We will email you a decision.",
      icon: "success",
    });
  }

  /* -------------------- loading -------------------- */
  if (loading) {
    return (
      <div className="container page">
        <div className="empty">
          <Loader2 size={28} className="spin" />
          <p className="muted" style={{ marginTop: 10 }}>Loading your verification…</p>
        </div>
      </div>
    );
  }

  if (error && !application) {
    return (
      <div className="container page">
        <div className="card card-pad" style={{ maxWidth: 640, marginInline: "auto" }}>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <AlertTriangle size={20} className="amber" />
            <h1 className="h-card">We couldn’t load your verification status</h1>
          </div>
          <p className="small muted">
            Your submitted application has not been changed. Please try again to check its status. If this
            continues, contact <a className="link" href="mailto:sellers@medlink.mw">sellers@medlink.mw</a>.
          </p>
          <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => void loadMarketplace()}>
              <RefreshCw size={15} /> Try again
            </button>
            <Link to="/supplier" className="btn btn-outline">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- approved: nothing to do -------------------- */
  if (status === "approved") {
    return (
      <div className="container page">
        <div className="card card-pad apply-success" style={{ maxWidth: 640, marginInline: "auto" }}>
          <span className="success-big">
            <BadgeCheck size={44} />
          </span>
          <span className="eyebrow">Verification complete</span>
          <h1 className="h-display" style={{ fontSize: "clamp(22px,4vw,30px)" }}>Your store is live</h1>
          <p className="muted" style={{ maxWidth: 520, marginInline: "auto" }}>
            MedLink has verified {application?.businessName}. Buyers can see your storefront and your products
            now, and escrow payouts go to the operating account on your application.
          </p>
          <div className="row wrap" style={{ justifyContent: "center", gap: 12, marginTop: 8 }}>
            <Link to="/supplier/products" className="btn btn-primary">List a product</Link>
            <Link to="/supplier" className="btn btn-outline">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- pending: read-only -------------------- */
  if (status === "pending" && !justResubmitted) {
    return (
      <div className="container page">
        <div className="page-head">
          <div>
            <span className="eyebrow">Supplier verification</span>
            <h1 className="h-section">Your verification is in progress</h1>
          </div>
          <span className={`badge ${kycStatusTone("pending")}`}>
            <Clock size={11} /> {kycStatusLabel("pending")}
          </span>
        </div>

        <VerificationProgress submittedAt={application?.submittedAt} reference={application?.ref} />

        <div className="split apply-layout">
          <div className="card card-pad">
            <div className="row" style={{ gap: 10, marginBottom: 14 }}>
              <ShieldCheck size={20} className="teal" />
              <div>
                <b className="small">
                  {application ? `Submitted ${shortDate(application.submittedAt)}` : "Submitted during sign-up"}
                </b>
                <p className="xs muted" style={{ margin: 0 }}>
                  {application
                    ? `Reference ${application.ref} · ${application.businessName}`
                    : "Your application is being matched to your supplier account."}
                </p>
              </div>
            </div>

            {application && <div className="review-grid card">
              <div className="review-col">
                <span className="eyebrow">Business</span>
                <div className="summary-row"><span>Name</span><b>{application.businessName}</b></div>
                <div className="summary-row"><span>Type</span><b>{application.businessType}</b></div>
                <div className="summary-row"><span>Category</span><b>{application.categoryFocus}</b></div>
              </div>
              <div className="review-col">
                <span className="eyebrow">Contact</span>
                <div className="summary-row"><span>Email</span><b>{application.email}</b></div>
                <div className="summary-row"><span>Phone</span><b>{application.phone}</b></div>
                <div className="summary-row"><span>Location</span><b>{application.city} · {application.area}</b></div>
              </div>
              <div className="review-col">
                <span className="eyebrow">KYC</span>
                <div className="summary-row"><span>Reg. number</span><b>{application.registrationNumber}</b></div>
                <div className="summary-row"><span>Director</span><b>{application.directorName}</b></div>
                <div className="summary-row"><span>ID</span><b>{application.directorIdType} · ••••</b></div>
              </div>
              <div className="review-col">
                <span className="eyebrow">Documents</span>
                {application.documents.map((d) => (
                  <div key={d.label} className="summary-row">
                    <span>{d.label}</span>
                    <b className="row" style={{ gap: 4 }}><Check size={13} className="green" /> {d.name}</b>
                  </div>
                ))}
              </div>
            </div>}

            <p className="small muted" style={{ marginTop: 14 }}>
              No action is needed while the review is running. We’ll notify you when MedLink has completed the
              checks or if any changes are needed.
            </p>
            <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
              <Link to="/supplier" className="btn btn-outline">Back to dashboard</Link>
            </div>
          </div>

          <VerifyAside />
        </div>
      </div>
    );
  }

  /* -------------------- submitted during sign-up -------------------- */
  if (status === "none" && !justResubmitted) {
    return (
      <div className="container page">
        <div className="page-head">
          <div>
            <span className="eyebrow">Supplier verification</span>
            <h1 className="h-section">Your verification is in progress</h1>
          </div>
          <span className={`badge ${kycStatusTone("pending")}`}>
            <Clock size={11} /> Under review
          </span>
        </div>
        <VerificationProgress />
        <div className="card card-pad" style={{ maxWidth: 720, margin: "20px auto 0" }}>
          <p className="small muted">
            Your verification details were submitted during sign-up and are being matched to your supplier
            account. No further action is needed. We’ll notify you once the MedLink team completes its review.
            If you need help, contact <a className="link" href="mailto:sellers@medlink.mw">sellers@medlink.mw</a>.
          </p>
          <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
            <Link to="/supplier" className="btn btn-outline">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- just resubmitted -------------------- */
  if (justResubmitted) {
    return (
      <div className="container page">
        <div className="card card-pad apply-success" style={{ maxWidth: 640, marginInline: "auto" }}>
          <span className="success-big">
            <Clock size={44} />
          </span>
          <span className="eyebrow">Resubmitted</span>
          <h1 className="h-display" style={{ fontSize: "clamp(22px,4vw,30px)" }}>Back with the review team</h1>
          <p className="muted" style={{ maxWidth: 520, marginInline: "auto" }}>
            Your corrected application is in the queue again under reference {application?.ref}. The banner on
            every page will tell you when MedLink makes a decision.
          </p>
          <div className="row wrap" style={{ justifyContent: "center", gap: 12, marginTop: 8 }}>
            <Link to="/supplier" className="btn btn-primary">Back to dashboard</Link>
            <button className="btn btn-outline" onClick={() => setJustResubmitted(false)}>
              Edit again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- no application yet, or a rejection to fix -------------------- */
  const rejected = status === "rejected";

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Supplier verification</span>
          <h1 className="h-section">
            {rejected ? "Fix your verification" : "Verify your business to publish your store"}
          </h1>
        </div>
        {rejected && (
          <span className={`badge ${kycStatusTone("rejected")}`}>
            <XCircle size={11} /> {kycStatusLabel("rejected")}
          </span>
        )}
      </div>

      {rejected && (
        <div className="kyc-banner kyc-banner-red" role="status" style={{ borderRadius: 14, border: "1px solid #f6c4d0", marginBottom: 18 }}>
          <XCircle size={18} className="shrink-0" />
          <div className="grow">
            <b className="small">Why this was not approved</b>
            <p className="xs" style={{ marginTop: 2 }}>
              {application?.reviewNote
                ? `MedLink said: “${application.reviewNote}”`
                : "MedLink could not verify the details you sent. Correct anything that looks wrong and send it again."}
            </p>
          </div>
        </div>
      )}

      <div className="split apply-layout">
        <SupplierKycWizard
          mode={rejected ? "resubmit" : "apply"}
          initialForm={initialForm}
          initialDocs={initialDocs}
          submitting={submitting}
          onSubmit={(input) => void handleSubmit(input)}
          onUploadError={(name, message) => push({ title: "Upload failed", message: `${name} — ${message}`, icon: "error" })}
          onUploadUnavailable={(message) => push({ title: "Uploads unavailable", message, icon: "info" })}
        />

        <VerifyAside />
      </div>

      {!rejected && (
        <p className="small muted" style={{ textAlign: "center", marginTop: 24 }}>
          Signed in as <b>{user?.email}</b> — this application will be linked to your account automatically.
        </p>
      )}
    </div>
  );
}

function VerificationProgress({
  submittedAt,
  reference,
}: {
  submittedAt?: string;
  reference?: string;
}) {
  return (
    <section className="card card-pad verification-progress" aria-label="Verification progress">
      <div className="between wrap" style={{ marginBottom: 14 }}>
        <div>
          <span className="eyebrow">Review process</span>
          <h2 className="h-card" style={{ marginTop: 4 }}>MedLink is reviewing your application</h2>
        </div>
        {reference && <span className="badge badge-soft">Reference {reference}</span>}
      </div>
      <div className="kyc-track">
        <div className="kyc-step kyc-done">
          <span className="kyc-dot"><Check size={14} /></span>
          <div>
            <b className="small">Application submitted</b>
            <p className="xs muted">{submittedAt ? shortDate(submittedAt) : "Submitted during sign-up"}</p>
          </div>
        </div>
        <div className="kyc-step kyc-current">
          <span className="kyc-dot"><Clock size={14} /></span>
          <div>
            <b className="small">MedLink team review</b>
            <p className="xs muted">Our compliance team is checking your business details and documents.</p>
          </div>
        </div>
        <div className="kyc-step">
          <span className="kyc-dot">3</span>
          <div>
            <b className="small">Decision and notification</b>
            <p className="xs muted">We’ll let you know when the review is complete.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function VerifyAside() {
  return (
    <aside className="apply-aside">
      <div className="card card-pad">
        <h3 className="h-card row" style={{ gap: 8 }}>
          <ShieldCheck size={18} className="teal" /> How verification works
        </h3>
        <ul className="check-list small">
          <li><Check size={14} className="green" /> You submit the form and the documents</li>
          <li><Check size={14} className="green" /> Compliance checks registration and identity</li>
          <li><Check size={14} className="green" /> Approved stores and products go public</li>
        </ul>
        <p className="xs muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
          Your dashboard, products, inventory and settings work the whole time. Only the public storefront
          waits for approval.
        </p>
      </div>
      <div className="card card-pad">
        <h3 className="h-card row" style={{ gap: 8 }}>
          <Headset size={18} className="teal" /> Need help?
        </h3>
        <div className="row" style={{ gap: 8 }}><Phone size={15} className="muted" /><span className="small">+265 888 000 123</span></div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}><Mail size={15} className="muted" /><span className="small">sellers@medlink.mw</span></div>
      </div>
    </aside>
  );
}
