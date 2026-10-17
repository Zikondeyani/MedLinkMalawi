/* ============================================================
   MedLink — FileUploader
   One upload control for every file in the app. The file always lands in
   the uploader's Cloudinary folder (see lib/cloudinary.ts); this component
   only decides how the result is reported back.

   Usage:
     <FileUploader
       purpose="profile"
       accept="image/png,image/jpeg"
       label="Profile photo"
       value={profile.avatarUrl}
       onUploaded={(file) => saveAvatar(file.url)}
     />
   ============================================================ */
import { useRef, useState } from "react";
import { uploadFile, type UploadOwner, type UploadPurpose } from "../../lib/cloudinary";

export interface FileUploaderProps {
  /** Which sub-folder inside the owner's folder this file belongs to. */
  purpose: UploadPurpose;
  /** Who owns the file — normally `useUploadOwner()`. */
  owner: UploadOwner;
  /** `accept` attribute for the hidden input, e.g. "image/png,image/jpeg". */
  accept: string;
  label: string;
  /** Current image URL, if the record already has one. */
  value?: string | null;
  /** Called with the stored file — persist `file.url` in the database. */
  onUploaded: (file: { url: string; publicId: string; folder: string }) => void;
  /** Optional note shown under the label, e.g. the target folder. */
  hint?: string;
  /** Rendered as a circle instead of a wide card (avatars). */
  round?: boolean;
  /** Hide the image preview when another component already previews this upload. */
  showPreview?: boolean;
  maxBytes?: number;
}

export default function FileUploader({
  purpose,
  owner,
  accept,
  label,
  value,
  onUploaded,
  hint,
  round = false,
  showPreview = true,
  maxBytes,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadFile(file, { purpose, owner, maxBytes });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.file.url);
    onUploaded(result.file);
  }

  const shown = preview ?? value ?? null;

  return (
    <div className={`uploader${round ? " uploader-round" : ""}`}>
      <div className="uploader-row">
        {round && showPreview ? (
          <span className="uploader-avatar" aria-hidden="true">
            {shown ? <img src={shown} alt="" /> : null}
          </span>
        ) : null}

        <div className="uploader-text">
          <div className="uploader-label">{label}</div>
          {hint ? <div className="uploader-hint">{hint}</div> : null}
          {error ? <div className="uploader-error">{error}</div> : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="visually-hidden"
          onChange={(event) => {
            void handle(event.target.files?.[0]);
            // Allow re-picking the same file after a failure.
            event.target.value = "";
          }}
        />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading…" : shown ? "Replace" : "Upload"}
        </button>
      </div>
      {shown && !round && showPreview ? <img className="uploader-preview" src={shown} alt="" /> : null}
    </div>
  );
}
