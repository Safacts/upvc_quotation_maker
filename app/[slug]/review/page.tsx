import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import ReviewForm from "./ReviewForm";

const MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) return {};
  const cfg = parseClientConfig(client.config || {}, client.id);
  return {
    title: `Rate your experience - ${cfg.companyName || cfg.appName}`,
    icons: { icon: `/api/favicon/${encodeURIComponent(client.id)}` },
  };
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();
  const cfg = parseClientConfig(client.config || {}, client.id);
  const companyName = cfg.companyName || cfg.appName;

  return (
    <div
      style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#ffffff" }}
    >
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div
          style={{
            margin: "0 auto",
            maxWidth: "768px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {cfg.logoUrl ? (
              <img
                src={cfg.logoUrl}
                alt={`${companyName} logo`}
                style={{ height: "36px", width: "auto", objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: "36px",
                  height: "36px",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#d89b25",
                }}
              >
                {(companyName || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <span
              style={{
                fontFamily: MONO,
                fontSize: "14px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              {companyName}
            </span>
          </div>
          <a
            href={`/${slug}/`}
            className="review-back"
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            ← Back
          </a>
        </div>
      </header>
      <main style={{ margin: "0 auto", maxWidth: "768px", padding: "48px 20px" }}>
        <ReviewForm
          clientId={slug}
          companyName={companyName}
          quotationNo={q?.trim() || undefined}
        />
      </main>
    </div>
  );
}
