"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";

type Review = {
  id: number;
  customer_name: string;
  role?: string | null;
  rating: number;
  review_text: string;
  source?: string | null;
  created_at?: string;
};

type Status = "idle" | "submitting" | "success" | "error";

const MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const GOLD = "#d89b25";
const BORDER = "1px solid rgba(255,255,255,0.1)";
const SUGGESTIONS = [
  "Excellent workmanship",
  "Very professional team",
  "On-time installation",
  "High quality materials",
];

const labelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: "12px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: GOLD,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: BORDER,
  backgroundColor: "rgba(255,255,255,0.05)",
  padding: "10px 12px",
  fontSize: "14px",
  color: "#ffffff",
  marginTop: "6px",
};

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          color={i <= value ? GOLD : "rgba(255,255,255,0.2)"}
          fill={i <= value ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export default function ReviewForm({
  clientId,
  companyName,
  quotationNo,
}: {
  clientId: string;
  companyName: string;
  quotationNo?: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [submitHover, setSubmitHover] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews/${encodeURIComponent(clientId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!quotationNo) return;
    let cancelled = false;
    fetch(
      `/api/reviews/${encodeURIComponent(clientId)}?q=${encodeURIComponent(quotationNo)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.quotation?.has_review) {
          setAlreadyReviewed(true);
          return;
        }
        if (data?.quotation?.customer_name) {
          setName((prev) =>
            prev.trim() === "" ? data.quotation.customer_name.trim() : prev,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quotationNo, clientId]);

  const applySuggestion = (suggestion: string) => {
    if (reviewText.trim() === "") {
      setReviewText(suggestion);
    } else {
      const sep = /\.\s*$/.test(reviewText) ? " " : ". ";
      setReviewText(`${reviewText.trimEnd()}${sep}${suggestion}`);
    }
  };

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !reviewText.trim() || rating < 1) {
        setStatus("error");
        setError("Please enter your name, a star rating and your review.");
        return;
      }
      setStatus("submitting");
      setError("");
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            customerName: name,
            role,
            rating,
            reviewText,
            ...(quotationNo ? { quotationNo } : {}),
          }),
        });
        const data = await res.json();
        if (res.status === 409 || data.code === "duplicate_review") {
          setError(data.error || "This quotation has already been reviewed. Thank you!");
          setAlreadyReviewed(true);
          return;
        }
        if (!res.ok || !data.ok) {
          setStatus("error");
          setError(data.error || "Something went wrong. Please try again.");
          return;
        }
        setStatus("success");
        setReviews((prev) => [data.review, ...prev]);
      } catch {
        setStatus("error");
        setError("Something went wrong. Please try again.");
      }
    },
    [clientId, name, role, rating, reviewText, quotationNo],
  );

  if (alreadyReviewed) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          padding: "64px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "64px",
            height: "64px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: "1px solid rgba(216,155,37,0.4)",
            backgroundColor: "rgba(216,155,37,0.1)",
            color: GOLD,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1
          style={{
            fontFamily: MONO,
            fontSize: "18px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Thank you!
        </h1>
        <p
          style={{ maxWidth: "448px", fontSize: "14px", color: "rgba(255,255,255,0.7)" }}
        >
          This quotation has already been reviewed. Your review helps us improve.
        </p>
        <a
          href={`/${clientId}/`}
          style={{
            marginTop: "8px",
            border: BORDER,
            padding: "10px 20px",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.8)",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Back to {companyName}
        </a>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          padding: "64px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "64px",
            height: "64px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: "1px solid rgba(216,155,37,0.4)",
            backgroundColor: "rgba(216,155,37,0.1)",
            color: GOLD,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1
          style={{
            fontFamily: MONO,
            fontSize: "18px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Thank you!
        </h1>
        <p
          style={{ maxWidth: "448px", fontSize: "14px", color: "rgba(255,255,255,0.7)" }}
        >
          Your review helps us improve.
        </p>
        <a
          href={`/${clientId}/`}
          style={{
            marginTop: "8px",
            border: BORDER,
            padding: "10px 20px",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.8)",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Back to {companyName}
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      <section style={{ border: BORDER, padding: "32px" }}>
        <h1
          style={{
            fontFamily: MONO,
            fontSize: "18px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Rate your experience
        </h1>
        <p
          style={{ marginTop: "8px", fontSize: "14px", color: "rgba(255,255,255,0.6)" }}
        >
          Tell us how your project went with {companyName}.
        </p>
        <form
          onSubmit={onSubmit}
          style={{
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div>
            <label htmlFor="review-name" style={labelStyle}>
              Name
            </label>
            <input
              id="review-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="review-input"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="review-role" style={labelStyle}>
              Company / Role <span style={{ color: "rgba(255,255,255,0.4)" }}>(optional)</span>
            </label>
            <input
              id="review-role"
              type="text"
              maxLength={100}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Homeowner, Project Manager"
              className="review-input"
              style={inputStyle}
            />
          </div>
          <div>
            <span style={{ ...labelStyle, display: "block" }}>Rating</span>
            <div style={{ marginTop: "6px", display: "flex", gap: "4px" }}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <Star
                    size={30}
                    aria-hidden="true"
                    color={value <= rating ? GOLD : "rgba(255,255,255,0.2)"}
                    fill={value <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={{ ...labelStyle, display: "block" }}>Quick picks</span>
            <div
              style={{
                marginTop: "6px",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {SUGGESTIONS.map((suggestion) => {
                const chosen = reviewText.includes(suggestion);
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    aria-pressed={chosen}
                    style={{
                      border: chosen
                        ? "1px solid rgba(216,155,37,0.6)"
                        : BORDER,
                      backgroundColor: chosen
                        ? "rgba(216,155,37,0.15)"
                        : "rgba(255,255,255,0.05)",
                      color: chosen ? GOLD : "rgba(255,255,255,0.8)",
                      padding: "6px 12px",
                      fontSize: "13px",
                      cursor: "pointer",
                      borderRadius: "999px",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="review-text" style={labelStyle}>
              Review
            </label>
            <textarea
              id="review-text"
              required
              rows={4}
              maxLength={1000}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your experience..."
              className="review-input"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
          {status === "error" && error && (
            <p style={{ fontSize: "14px", color: "#f87171", margin: 0 }} role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === "submitting"}
            onMouseEnter={() => setSubmitHover(true)}
            onMouseLeave={() => setSubmitHover(false)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid rgba(216,155,37,0.6)",
              backgroundColor: submitHover
                ? "rgba(216,155,37,0.2)"
                : "rgba(216,155,37,0.1)",
              padding: "12px 20px",
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: GOLD,
              cursor: status === "submitting" ? "not-allowed" : "pointer",
              opacity: status === "submitting" ? 0.5 : 1,
              transition: "background-color 0.15s ease",
            }}
          >
            {status === "submitting" ? "Submitting..." : "Submit review"}
          </button>
        </form>
      </section>

      {reviews.length > 0 && (
        <section>
          <h2 style={{ ...labelStyle, margin: 0 }}>Reviews</h2>
          <div style={{ marginTop: "16px", display: "grid", gap: "16px" }}>
            {reviews.map((review) => (
              <article key={review.id} style={{ border: BORDER, padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      width: "40px",
                      height: "40px",
                      flexShrink: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%",
                      border: "1px solid rgba(216,155,37,0.4)",
                      backgroundColor: "rgba(216,155,37,0.1)",
                      fontFamily: MONO,
                      fontSize: "14px",
                      color: GOLD,
                    }}
                  >
                    {(review.customer_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Stars value={Math.min(5, Math.max(1, review.rating))} />
                    <p
                      style={{
                        marginTop: "8px",
                        fontSize: "14px",
                        lineHeight: 1.625,
                        color: "rgba(255,255,255,0.8)",
                        marginBottom: 0,
                      }}
                    >
                      “{review.review_text}”
                    </p>
                    <p
                      style={{
                        marginTop: "12px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#ffffff",
                        marginBottom: 0,
                      }}
                    >
                      {review.customer_name}
                    </p>
                    {review.role && (
                      <p
                        style={{
                          marginTop: "2px",
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.5)",
                          marginBottom: 0,
                        }}
                      >
                        {review.role}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
