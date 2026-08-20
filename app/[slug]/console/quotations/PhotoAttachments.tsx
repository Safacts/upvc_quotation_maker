"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";

type Photo = { id: string; public_url: string; filename?: string; bytes?: number; caption?: string };

export default function PhotoAttachments({ quotationId }: { quotationId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quotationId) return;
    fetch(`/api/console/quotations/${quotationId}/photos`, { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load photos")))
      .then((d) => setPhotos(d.photos || []))
      .catch((e) => setError(e.message));
  }, [quotationId]);

  async function upload(files: FileList | null) {
    if (!quotationId || !files?.length) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/console/quotations/${quotationId}/photos`, { method: "POST", body: form, credentials: "same-origin" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setPhotos((current) => [...current, data.photo]);
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function remove(id: string) {
    if (!quotationId || !window.confirm("Remove this attachment?")) return;
    const res = await fetch(`/api/console/quotations/${quotationId}/photos?photoId=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    if (res.ok) setPhotos((current) => current.filter((p) => p.id !== id));
    else setError("Could not remove the attachment");
  }

  return <div className="vc-card">
    <div className="vc-card-head"><span className="vc-card-title"><ImagePlus size={15} /> Site photos & sketches</span><span style={{ marginLeft: "auto", color: "#8a94a1", fontSize: 11 }}>{photos.length}/100</span></div>
    {!quotationId ? <div style={{ padding: "14px 16px", color: "#8a94a1", fontSize: 12 }}>Save the quotation first, then attach site photos or sketches.</div> : <div style={{ padding: 16 }}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button type="button" className="vc-btn vc-btn-sm" disabled={busy || photos.length >= 100} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} {busy ? "Uploading..." : "Add photos"}</button>
      <span style={{ marginLeft: 10, color: "#8a94a1", fontSize: 11 }}>JPG, PNG, WebP or HEIC · max 10 MB each</span>
      {error && <div style={{ color: "#b42318", fontSize: 12, marginTop: 10 }}>{error}</div>}
      {photos.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, marginTop: 14 }}>{photos.map((photo) => <div key={photo.id} style={{ position: "relative", border: "1px solid #fed7aa", borderRadius: 8, overflow: "hidden", background: "#fff7ed" }}><a href={photo.public_url} target="_blank" rel="noreferrer"><img src={photo.public_url} alt={photo.caption || photo.filename || "Quotation attachment"} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} /></a><button type="button" aria-label={`Remove ${photo.filename || "photo"}`} onClick={() => remove(photo.id)} style={{ position: "absolute", top: 5, right: 5, border: 0, borderRadius: 5, padding: 4, color: "#991b1b", background: "#fff" }}><Trash2 size={13} /></button><div style={{ padding: "5px 7px", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{photo.filename || "Attachment"}</div></div>)}</div>}
    </div>}
  </div>;
}
