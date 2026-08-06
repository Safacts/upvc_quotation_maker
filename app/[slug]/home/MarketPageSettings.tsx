"use client";

import { useCallback, useEffect, useState } from "react";

interface Review {
  id: number;
  customer_name: string;
  role: string | null;
  rating: number;
  review_text: string;
  is_visible: boolean;
  source: string;
  created_at: string;
}

export function MarketPageSettings({ clientId }: { clientId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${clientId}/manage`);
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch {
      showToast("Failed to load reviews", "error");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const addReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, customerName: name.trim(), role: role.trim(), rating, reviewText: text.trim(), source: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setName("");
      setRole("");
      setText("");
      setRating(5);
      await fetchReviews();
      showToast("Review added");
    } catch {
      showToast("Failed to add review", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (review: Review) => {
    try {
      const res = await fetch(`/api/reviews/${clientId}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id, isVisible: !review.is_visible }),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchReviews();
    } catch {
      showToast("Failed to update", "error");
    }
  };

  const deleteReview = async (review: Review) => {
    if (!confirm(`Delete review from ${review.customer_name}?`)) return;
    try {
      const res = await fetch(`/api/reviews/${clientId}/manage`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id }),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchReviews();
      showToast("Review deleted");
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  return (
    <div style={{ background: "white", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Manage Testimonials</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Add, edit, and control which reviews appear on your market page.</p>
        </div>
        <span style={{ fontSize: 12, background: "#e0e7ff", color: "#3730a3", padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
          {reviews.filter(r => r.is_visible).length} visible
        </span>
      </div>

      {toast && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, background: toast.type === "success" ? "#d1fae5" : "#fee2e2", color: toast.type === "success" ? "#059669" : "#ef4444", fontSize: 13, fontWeight: 500 }}>
          {toast.message}
        </div>
      )}

      {/* Add Review Form */}
      <form onSubmit={addReview} style={{ background: "#f8fafc", padding: 16, borderRadius: 12, marginBottom: 20, border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Add New Review</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <input type="text" placeholder="Customer Name *" value={name} onChange={e => setName(e.target.value)} required
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }} />
          <input type="text" placeholder="Role (optional, e.g. Architect)" value={role} onChange={e => setRole(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }} />
        </div>
        <textarea placeholder="Review Text *" value={text} onChange={e => setText(e.target.value)} required rows={3}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, marginBottom: 12, resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <button type="button" key={s} onClick={() => setRating(s)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: s <= rating ? "#f59e0b" : "#cbd5e1", padding: 0 }}>
                ★
              </button>
            ))}
          </div>
          <button type="submit" disabled={saving}
            style={{ padding: "10px 20px", background: "#6366f1", color: "white", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {saving ? "Adding..." : "Add Review"}
          </button>
        </div>
      </form>

      {/* Reviews List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>No reviews yet. Add your first one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reviews.map(r => (
            <div key={r.id} style={{ padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", background: r.is_visible ? "white" : "#f8fafc", opacity: r.is_visible ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{r.customer_name}</span>
                    {r.role && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 10 }}>{r.role}</span>}
                    <span style={{ fontSize: 12, color: "#f59e0b" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{r.review_text}</p>
                </div>
                <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                  <button onClick={() => toggleVisibility(r)} title={r.is_visible ? "Hide from page" : "Show on page"}
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: r.is_visible ? "#d1fae5" : "#f1f5f9", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                    {r.is_visible ? "👁 Visible" : "👁‍🗨 Hidden"}
                  </button>
                  <button onClick={() => deleteReview(r)} title="Delete"
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fee2e2", cursor: "pointer", fontSize: 12, color: "#ef4444" }}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
