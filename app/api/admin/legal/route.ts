import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/session";

const DOCUMENTS = {
  PAID_PILOT_CONTRACT: "PAID_PILOT_CONTRACT.md",
  SUPPORT_BOUNDARY_TERMS: "SUPPORT_BOUNDARY_TERMS.md",
  REFUND_POLICY: "REFUND_POLICY.md",
  CUSTOMER_DATA_CONSENT_FORM: "CUSTOMER_DATA_CONSENT_FORM.md",
} as const;

type DocumentKey = keyof typeof DOCUMENTS;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin";
}

function fileFor(key: string) {
  if (!(key in DOCUMENTS)) return null;
  return path.join(process.cwd(), "legal", DOCUMENTS[key as DocumentKey]);
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return json({ error: "not authorized" }, 403);
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return json({ documents: Object.entries(DOCUMENTS).map(([id, filename]) => ({ id, filename })) });
  }
  const file = fileFor(key);
  if (!file) return json({ error: "unknown legal document" }, 404);
  try {
    const content = await fs.readFile(file, "utf8");
    if (request.nextUrl.searchParams.get("download") === "1") {
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${DOCUMENTS[key as DocumentKey]}"`,
        },
      });
    }
    return json({ id: key, filename: DOCUMENTS[key as DocumentKey], content });
  } catch {
    return json({ error: "legal document not found" }, 404);
  }
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return json({ error: "not authorized" }, 403);
  let body: { key?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const file = body.key ? fileFor(body.key) : null;
  if (!file) return json({ error: "unknown legal document" }, 404);
  if (typeof body.content !== "string") return json({ error: "content is required" }, 400);
  if (body.content.length > 500_000) return json({ error: "document is too large" }, 413);
  await fs.writeFile(file, body.content, "utf8");
  return json({ success: true, updatedAt: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return json({ error: "not authorized" }, 403);
  const key = request.nextUrl.searchParams.get("key");
  const file = key ? fileFor(key) : null;
  if (!file || !key) return json({ error: "unknown legal document" }, 404);
  try {
    const content = await fs.readFile(file, "utf8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${DOCUMENTS[key as DocumentKey]}"`,
      },
    });
  } catch {
    return json({ error: "legal document not found" }, 404);
  }
}
