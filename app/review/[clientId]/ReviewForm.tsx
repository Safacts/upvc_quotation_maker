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

const labelClass = "font-mono text-xs tracking-[0.2em] uppercase text-[#d89b25]";
const inputClass =
  "w-full border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#d89b25]/60";

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          className={i <= value ? "text-[#d89b25]" : "text-white/20"}
          fill={i <= value ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export default function ReviewForm({
  clientId,
  companyName,
}: {
  clientId: string;
  companyName: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);

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
          }),
        });
        const data = await res.json();
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
    [clientId, name, role, rating, reviewText],
  );

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d89b25]/40 bg-[#d89b25]/10 text-[#d89b25]">
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
        <h1 className="font-mono text-lg tracking-[0.2em] uppercase">
          Thank you!
        </h1>
        <p className="max-w-md text-sm text-white/70">
          Your review helps us improve.
        </p>
        <a
          href={`/${clientId}/`}
          className="mt-2 border border-white/10 px-5 py-2.5 font-mono text-xs tracking-[0.2em] uppercase text-white/80 transition-colors hover:border-[#d89b25]/60 hover:text-[#d89b25]"
        >
          Back to {companyName}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section className="border border-white/10 p-6 sm:p-8">
        <h1 className="font-mono text-lg tracking-[0.2em] uppercase">
          Rate your experience
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Tell us how your project went with {companyName}.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="review-name" className={labelClass}>
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
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="review-role" className={labelClass}>
              Company / Role <span className="text-white/40">(optional)</span>
            </label>
            <input
              id="review-role"
              type="text"
              maxLength={100}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Homeowner, Project Manager"
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <span className={labelClass}>Rating</span>
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={30}
                    aria-hidden="true"
                    className={
                      value <= rating ? "text-[#d89b25]" : "text-white/20"
                    }
                    fill={value <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="review-text" className={labelClass}>
              Review
            </label>
            <textarea
              id="review-text"
              required
              rows={4}
              maxLength={1000}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your experience…"
              className={`${inputClass} mt-1.5 resize-y`}
            />
          </div>
          {status === "error" && error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full border border-[#d89b25]/60 bg-[#d89b25]/10 px-5 py-3 font-mono text-xs tracking-[0.2em] uppercase text-[#d89b25] transition-colors hover:bg-[#d89b25]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting…" : "Submit review"}
          </button>
        </form>
      </section>

      {reviews.length > 0 && (
        <section>
          <h2 className={labelClass}>Reviews</h2>
          <div className="mt-4 grid gap-4">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="border border-white/10 p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d89b25]/40 bg-[#d89b25]/10 font-mono text-sm text-[#d89b25]">
                    {(review.customer_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <Stars value={Math.min(5, Math.max(1, review.rating))} />
                    <p className="mt-2 text-sm leading-relaxed text-white/80">
                      “{review.review_text}”
                    </p>
                    <p className="mt-3 text-sm font-medium text-white">
                      {review.customer_name}
                    </p>
                    {review.role && (
                      <p className="mt-0.5 text-xs text-white/50">
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
