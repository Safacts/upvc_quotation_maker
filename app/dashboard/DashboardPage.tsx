"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard.css";

const SUPABASE_URL = "https://effxrwrbsjduvhmorvrq.supabase.co";
const SUPABASE_KEY = "sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN";
const SUPERUSER_EMAIL = "kongaaadisheshu@gmail.com";
const APK_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/app-releases/Venkateshwara_UPVC.apk`;

function clientId() {
  return localStorage.getItem("portal_client_id") || "venkateshwara";
}

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "x-client-id": clientId(),
  };
}

async function supabaseFetch(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function computeQuote(q: any, mItems: any[], umItems: any[]) {
  let totalMeasured = 0;
  mItems.forEach((item) => {
    const w = Number(item.width || 0);
    const h = Number(item.height || 0);
    const u = Number(item.units || 1);
    const r = Number(item.rate || 0);
    const sft = (w / 304.8) * (h / 304.8);
    totalMeasured += sft * u * r;
  });

  let totalUnmeasured = 0;
  umItems.forEach((item) => {
    const u = Number(item.units || 1);
    const r = Number(item.rate || 0);
    totalUnmeasured += u * r;
  });

  const subtotal = totalMeasured + totalUnmeasured;
  const transport = Number(q.transport_cost || 0);
  const igst = (subtotal + transport) * 0.18;
  const grandTotal = subtotal + transport + igst;

  return {
    ...q,
    mItems,
    umItems,
    subtotal,
    transport,
    igst,
    grandTotal,
    dateStr: q.date
      ? new Date(q.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-",
  };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allQuotations, setAllQuotations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ text: "", color: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperuser =
    typeof window !== "undefined" &&
    localStorage.getItem("portal_email") === SUPERUSER_EMAIL;
  const isAdmin =
    typeof window !== "undefined" && localStorage.getItem("portal_role") === "admin";

  const displayedQuotations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allQuotations;
    return allQuotations.filter((item) => {
      return (
        (item.customer_name || "").toLowerCase().includes(q) ||
        (item.quote_no || "").toLowerCase().includes(q) ||
        (item.reference || "").toLowerCase().includes(q)
      );
    });
  }, [allQuotations, search]);

  const stats = useMemo(() => {
    const totalQuotes = displayedQuotations.length;
    const totalRevenue = displayedQuotations.reduce(
      (sum, q) => sum + q.grandTotal,
      0,
    );
    const avgValue = totalQuotes > 0 ? totalRevenue / totalQuotes : 0;
    return { totalQuotes, totalRevenue, avgValue };
  }, [displayedQuotations]);

  useEffect(() => {
    if (localStorage.getItem("portal_session") !== "active") {
      window.location.href = "/login";
      return;
    }
    loadQuotations();
  }, []);

  async function loadQuotations() {
    setLoading(true);
    setError("");
    try {
      const [quotes, mItems, umItems] = await Promise.all([
        supabaseFetch("quotations?select=*&order=created_at.desc"),
        supabaseFetch("measured_items?select=*"),
        supabaseFetch("unmeasured_items?select=*"),
      ]);

      const mItemsMap: Record<string, any[]> = {};
      mItems.forEach((item) => {
        const qId = item.quotation_id;
        if (!mItemsMap[qId]) mItemsMap[qId] = [];
        mItemsMap[qId].push(item);
      });

      const umItemsMap: Record<string, any[]> = {};
      umItems.forEach((item) => {
        const qId = item.quotation_id;
        if (!umItemsMap[qId]) umItemsMap[qId] = [];
        umItemsMap[qId].push(item);
      });

      setAllQuotations(
        quotes.map((q) =>
          computeQuote(q, mItemsMap[q.id] || [], umItemsMap[q.id] || []),
        ),
      );
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(
        "Unable to load quotation records. Please check your network connection.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelected(file: File | undefined) {
    if (file && file.name.endsWith(".apk")) {
      setApkFile(file);
      setUploadStatus({
        text: `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
        color: "#0f172a",
      });
    } else {
      alert("Please select a valid .apk file.");
      setApkFile(null);
      setUploadStatus({ text: "", color: "" });
    }
  }

  async function uploadReleaseApk() {
    if (!apkFile) return;
    setUploading(true);
    setUploadStatus({
      text: "Uploading release APK to Supabase Storage...",
      color: "#6366f1",
    });

    try {
      const res = await fetch(
        `${SUPABASE_URL}/storage/v1/object/app-releases/Venkateshwara_UPVC.apk`,
        {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/vnd.android.package-archive",
            "x-upsert": "true",
          },
          body: apkFile,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setUploadStatus({
        text: "Successfully uploaded and updated the latest release APK!",
        color: "#10b981",
      });
      setApkFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      console.error("Storage Upload Error:", err);
      const isBucketMissing =
        (err.message || "").includes("not_found") ||
        err.status === 404;
      setUploadStatus({
        text: isBucketMissing
          ? 'Upload failed: The target storage bucket "app-releases" is missing or disabled in Supabase. Please verify storage is active.'
          : "Upload failed: " + (err.message || "Unknown network error."),
        color: "#ef4444",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("portal_session");
    localStorage.removeItem("portal_email");
    localStorage.removeItem("portal_role");
    localStorage.removeItem("portal_client_id");
    localStorage.removeItem("portal_auth");
    localStorage.removeItem("portal_auth_hash");
    localStorage.removeItem("portal_app_slug");
    window.location.href = "/login";
  }

  function exportTableToCSV() {
    const csv: string[] = [];
    const headers = [
      "Quotation No",
      "Customer Name",
      "Date",
      "Subtotal",
      "Transport",
      "IGST",
      "Grand Total",
    ];
    csv.push(headers.join(","));

    displayedQuotations.forEach((q) => {
      const row = [
        `"${q.quote_no || ""}"`,
        `"${q.customer_name || ""}"`,
        `"${q.dateStr}"`,
        q.subtotal.toFixed(2),
        q.transport.toFixed(2),
        q.igst.toFixed(2),
        q.grandTotal.toFixed(2),
      ];
      csv.push(row.join(","));
    });

    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = "quotations.csv";
    link.href = window.URL.createObjectURL(csvFile);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div>
      <div className="nav-bar">
        <div className="logo-container">
          <img
            src="/logo.png"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://placehold.co/100";
            }}
            alt="Vitharn UPVC Quotation Maker"
          />
          <span className="logo-text">Vitharn UPVC Quotation Maker</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin && (
            <a
              href="/admin"
              className="btn-download"
              style={{ background: "#6366f1" }}
            >
              <span className="desktop-text">Back to Admin Panel</span>
              <span className="mobile-text">Admin</span>
            </a>
          )}
          <a href={APK_STORAGE_URL} className="btn-download" download>
            <span className="desktop-text">Download App</span>
            <span className="mobile-text">Download</span>
          </a>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="container">
        {isSuperuser && (
          <div className="superuser-panel">
            <h2>App Release Manager</h2>
            <p>
              Upload a new Android Application release package (APK). It will
              automatically overwrite the older release in the Supabase Storage
              bucket.
            </p>
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              <span id="uploadZoneText">
                {apkFile
                  ? `Selected: ${apkFile.name} (${(apkFile.size / (1024 * 1024)).toFixed(2)} MB)`
                  : "Select or drop a new .apk file here"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk"
                style={{ display: "none" }}
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
            </div>
            <button
              className="upload-btn"
              onClick={uploadReleaseApk}
              disabled={!apkFile || uploading}
            >
              Upload APK
            </button>
            {uploadStatus.text && (
              <div
                className="status-msg"
                style={{ color: uploadStatus.color }}
              >
                {uploadStatus.text}
              </div>
            )}
          </div>
        )}

        <h1>Quotation Database Logs</h1>

        <div className="analytics-grid">
          <div className="stat-card">
            <h3>Total Quotations</h3>
            <p>{stats.totalQuotes.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>Total Revenue</h3>
            <p>
              ₹
              {stats.totalRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="stat-card">
            <h3>Avg. Quote Value</h3>
            <p>
              ₹
              {stats.avgValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, quote no, or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-export" onClick={exportTableToCSV}>
            Export CSV
          </button>
        </div>

        <div className="card">
          {loading && (
            <div className="loading-container">
              <div className="spinner" />
            </div>
          )}

          {error && !loading && (
            <p style={{ color: "#ef4444", padding: "20px", textAlign: "center" }}>
              {error}
            </p>
          )}

          {!loading && !error && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Quotation No</th>
                    <th>Customer Name</th>
                    <th>Date</th>
                    <th>Subtotal</th>
                    <th>Transport</th>
                    <th>IGST (18%)</th>
                    <th>Grand Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedQuotations.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", color: "#64748b" }}>
                        No quotations found.
                      </td>
                    </tr>
                  ) : (
                    displayedQuotations.map((q, index) => (
                      <tr key={q.id || index}>
                        <td>
                          <strong>{q.quote_no || "-"}</strong>
                        </td>
                        <td>{q.customer_name || "-"}</td>
                        <td>{q.dateStr}</td>
                        <td>₹{q.subtotal.toFixed(2)}</td>
                        <td>₹{q.transport.toFixed(2)}</td>
                        <td>₹{q.igst.toFixed(2)}</td>
                        <td>
                          <strong>₹{q.grandTotal.toFixed(2)}</strong>
                        </td>
                        <td>
                          <button
                            className="btn-view"
                            onClick={() => setSelected(q)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="modal" style={{ display: "flex" }} onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Quotation {selected.quote_no || "-"}</h3>
              <button className="close-btn" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 20, fontSize: 14 }}>
                <p>
                  <strong>Customer:</strong> {selected.customer_name || "-"}
                </p>
                <p>
                  <strong>Reference:</strong> {selected.reference || "-"}
                </p>
                <p>
                  <strong>Date:</strong> {selected.dateStr}
                </p>
                <p>
                  <strong>Grand Total:</strong> ₹{selected.grandTotal.toFixed(2)}
                </p>
              </div>

              {selected.mItems.length > 0 && (
                <div className="item-section">
                  <h4>Measured Items ({selected.mItems.length})</h4>
                  {selected.mItems.map((item: any, i: number) => {
                    const w = Number(item.width || 0);
                    const h = Number(item.height || 0);
                    const u = Number(item.units || 1);
                    const r = Number(item.rate || 0);
                    const sft = (w / 304.8) * (h / 304.8);
                    const total = sft * u * r;
                    return (
                      <div className="item-grid" key={item.id || i}>
                        <div className="item-detail">
                          <strong>Code/Desc</strong>
                          {item.code || "-"} / {item.description || "-"}
                        </div>
                        <div className="item-detail">
                          <strong>Dimensions (mm)</strong>
                          {w}W x {h}H
                        </div>
                        <div className="item-detail">
                          <strong>Units / Rate</strong>
                          {u} / ₹{r}
                        </div>
                        <div className="item-detail">
                          <strong>Total</strong>₹{total.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selected.umItems.length > 0 && (
                <div className="item-section">
                  <h4>Unmeasured Items ({selected.umItems.length})</h4>
                  {selected.umItems.map((item: any, i: number) => {
                    const u = Number(item.units || 1);
                    const r = Number(item.rate || 0);
                    const total = u * r;
                    return (
                      <div className="item-grid" key={item.id || i}>
                        <div
                          className="item-detail"
                          style={{ gridColumn: "span 2" }}
                        >
                          <strong>Description</strong>
                          {item.description || "-"}
                        </div>
                        <div className="item-detail">
                          <strong>Units / Rate</strong>
                          {u} / ₹{r}
                        </div>
                        <div className="item-detail">
                          <strong>Total</strong>₹{total.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
