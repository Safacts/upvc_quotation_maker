import { NextRequest, NextResponse } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaGetAllPaged, supaPost } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";
import { buildQuotationPdf, type QuotationPdfData } from "@/lib/quotation-pdf";
import { toCsv } from "@/lib/export/spreadsheet";
import type { ClientConfig } from "@/lib/types";
// archiver is CommonJS with no TS default export; use require for the factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require("archiver") as (
  format: "zip" | "tar" | "json",
  options?: Record<string, unknown>,
) => any;
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/export-all?format=zip
 *
 * One-click data portability export. Returns a ZIP file containing ALL client
 * data: quotations (CSV + PDFs), customers, products, payments, audit_logs,
 * quotation photos, and a metadata.json manifest.
 *
 * Auth: requireConsoleSession + requireTier(clientId, "data_export").
 * Scoped to the authenticated client only — never cross-tenant.
 *
 * The ZIP is streamed via archiver so we don't buffer the entire archive in
 * memory before responding. For very large tenants this keeps the Vercel
 * function under its memory ceiling.
 */

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// CSV builders — one per table
// ---------------------------------------------------------------------------

function quotationsCsv(rows: any[]): string {
  const headers = [
    "id", "quote_no", "date", "customer_name", "contact_no", "email",
    "address", "reference", "supplier_company", "status", "transport_cost",
    "include_gst", "gst_percentage", "valid_until", "sent_at", "accepted_at",
    "rejected_at", "expired_at", "created_at",
  ];
  const data = rows.map((q) => [
    q.id, q.quote_no || "", q.date || "", q.customer_name || "",
    q.contact_no || "", q.email || "", q.address || "", q.reference || "",
    q.supplier_company || "", (q.status || "draft").toString().trim().toLowerCase(),
    num(q.transport_cost), q.include_gst ? "true" : "false",
    num(q.gst_percentage), q.valid_until || "", q.sent_at || "",
    q.accepted_at || "", q.rejected_at || "", q.expired_at || "",
    q.created_at || "",
  ]);
  return toCsv(headers, data);
}

function measuredItemsCsv(rows: any[]): string {
  const headers = [
    "id", "quotation_id", "client_id", "code", "description", "glass",
    "width", "height", "units", "rate", "created_at",
  ];
  const data = rows.map((m) => [
    m.id, m.quotation_id, m.client_id || "", m.code || "",
    m.description || "", m.glass || "", num(m.width), num(m.height),
    num(m.units, 1), num(m.rate), m.created_at || "",
  ]);
  return toCsv(headers, data);
}

function unmeasuredItemsCsv(rows: any[]): string {
  const headers = [
    "id", "quotation_id", "client_id", "description", "units", "rate",
    "created_at",
  ];
  const data = rows.map((u) => [
    u.id, u.quotation_id, u.client_id || "", u.description || "",
    num(u.units, 1), num(u.rate), u.created_at || "",
  ]);
  return toCsv(headers, data);
}

function customersCsv(rows: any[]): string {
  const headers = [
    "id", "client_id", "name", "phone", "email", "company",
    "address", "gst_number", "soft_deleted", "created_at", "updated_at",
  ];
  const data = rows.map((c) => [
    c.id, c.client_id || "", c.name || "", c.phone || "",
    c.email || "", c.company || "", c.address || "", c.gst_number || "",
    c.soft_deleted ? "true" : "false", c.created_at || "", c.updated_at || "",
  ]);
  return toCsv(headers, data);
}

function productsCsv(rows: any[]): string {
  const headers = [
    "id", "client_id", "name", "category", "description", "price",
    "unit", "soft_deleted", "created_at", "updated_at",
  ];
  const data = rows.map((p) => [
    p.id, p.client_id || "", p.name || "", p.category || "",
    p.description || "", num(p.price), p.unit || "SFT",
    p.soft_deleted ? "true" : "false", p.created_at || "", p.updated_at || "",
  ]);
  return toCsv(headers, data);
}

function paymentsCsv(rows: any[]): string {
  const headers = [
    "id", "client_id", "quotation_id", "customer_id", "amount",
    "payment_method", "payment_date", "reference", "notes",
    "created_at", "updated_at",
  ];
  const data = rows.map((p) => [
    p.id, p.client_id || "", p.quotation_id || "", p.customer_id || "",
    num(p.amount), p.payment_method || "", p.payment_date || "",
    p.reference || "", p.notes || "", p.created_at || "", p.updated_at || "",
  ]);
  return toCsv(headers, data);
}

function auditLogsCsv(rows: any[]): string {
  const headers = [
    "id", "client_id", "entity_type", "entity_id", "action",
    "old_value", "new_value", "actor", "created_at",
  ];
  const data = rows.map((a) => [
    a.id, a.client_id || "", a.entity_type || "", a.entity_id || "",
    a.action || "",
    a.old_value ? JSON.stringify(a.old_value) : "",
    a.new_value ? JSON.stringify(a.new_value) : "",
    a.actor || "", a.created_at || "",
  ]);
  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// PDF data builder — mirrors the console PDF route
// ---------------------------------------------------------------------------

function buildPdfData(q: any, config: ClientConfig, clientId: string): QuotationPdfData {
  const measured = (q.measured_items || []).map((m: any) => ({
    code: String(m.code || ""),
    description: String(m.description || ""),
    glass: String(m.glass || ""),
    width: num(m.width),
    height: num(m.height),
    units: num(m.units, 1),
    rate: num(m.rate),
  }));
  const unmeasured = (q.unmeasured_items || []).map((u: any) => ({
    description: String(u.description || ""),
    units: num(u.units, 1),
    rate: num(u.rate),
  }));
  const totals = quotationTotals(q, measured, unmeasured);

  return {
    quoteNo: String(q.quote_no || ""),
    date: q.date || q.created_at || new Date(),
    customerName: String(q.customer_name || ""),
    contactNo: String(q.contact_no || ""),
    email: String(q.email || ""),
    address: String(q.address || ""),
    reference: String(q.reference || ""),
    supplierCompany: String(q.supplier_company || ""),
    measured,
    unmeasured,
    totals,
    clientId: String(clientId || ""),
    companyName: String(config.companyName || config.appName || clientId),
    companyAddress: String(config.companyAddress || ""),
    companyProprietor: String(config.companyProprietor || ""),
    companyContact: String(config.companyContact || ""),
    gstNumber: String(config.gstNumber || ""),
    bankName: String(config.bankName || ""),
    bankBranch: String(config.bankBranch || ""),
    bankAccountNo: String(config.bankAccountNo || ""),
    bankIfsc: String(config.bankIfsc || ""),
    termsAndConditions: Array.isArray(config.termsAndConditions)
      ? config.termsAndConditions.map(String)
      : [],
    logoUrl: String(config.invoiceTopLogoUrl || config.logoUrl || ""),
    watermarkUrl: String(config.invoiceBackgroundLogoUrl || config.logoUrl || ""),
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers — chunked for large datasets
// ---------------------------------------------------------------------------

async function fetchAllQuotations(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "quotations",
    {
      client_id: "eq." + clientId,
      select:
        "id,quote_no,date,customer_name,contact_no,email,address,reference," +
        "supplier_company,status,transport_cost,include_gst,gst_percentage," +
        "valid_until,sent_at,accepted_at,rejected_at,expired_at,created_at," +
        "measured_items(id,code,description,glass,width,height,units,rate,client_id,quotation_id,created_at)," +
        "unmeasured_items(id,description,units,rate,client_id,quotation_id,created_at)",
      order: "created_at.desc,id.asc",
    },
    500,
    10000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllMeasuredItems(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "measured_items",
    {
      client_id: "eq." + clientId,
      select: "id,quotation_id,client_id,code,description,glass,width,height,units,rate,created_at",
      order: "quotation_id.asc,created_at.asc",
    },
    1000,
    50000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllUnmeasuredItems(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "unmeasured_items",
    {
      client_id: "eq." + clientId,
      select: "id,quotation_id,client_id,description,units,rate,created_at",
      order: "quotation_id.asc,created_at.asc",
    },
    1000,
    50000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllCustomers(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "customers",
    {
      client_id: "eq." + clientId,
      select: "id,client_id,name,phone,email,company,address,gst_number,soft_deleted,created_at,updated_at",
      order: "name.asc",
    },
    1000,
    10000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllProducts(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "products",
    {
      client_id: "eq." + clientId,
      select: "id,client_id,name,category,description,price,unit,soft_deleted,created_at,updated_at",
      order: "name.asc",
    },
    1000,
    10000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllPayments(clientId: string): Promise<any[]> {
  try {
    const { rows } = await supaGetAllPaged(
      "payments",
      {
        client_id: "eq." + clientId,
        select: "id,client_id,quotation_id,customer_id,amount,payment_method,payment_date,reference,notes,created_at,updated_at",
        order: "payment_date.desc,created_at.desc",
      },
      1000,
      10000,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    // payments table may not exist on older databases
    return [];
  }
}

async function fetchAllAuditLogs(clientId: string) {
  const { rows } = await supaGetAllPaged(
    "audit_logs",
    {
      client_id: "eq." + clientId,
      select: "id,client_id,entity_type,entity_id,action,old_value,new_value,actor,created_at",
      order: "created_at.desc",
    },
    1000,
    50000,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchQuotationPhotos(clientId: string) {
  try {
    const { rows } = await supaGetAllPaged(
      "quotation_photos",
      {
        client_id: "eq." + clientId,
        select: "id,quotation_id,client_id,storage_path,public_url,file_name,mime_type,sort_order,created_at",
        order: "quotation_id.asc,sort_order.asc",
      },
      1000,
      10000,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    // quotation_photos may not exist on older databases
    return [];
  }
}

async function fetchClientConfig(clientId: string): Promise<ClientConfig> {
  const rows = await supaGet("clients", {
    id: "eq." + clientId,
    select: "config",
    limit: 1,
  });
  const raw = Array.isArray(rows) && rows[0]?.config
    ? (typeof rows[0].config === "string" ? JSON.parse(rows[0].config) : rows[0].config)
    : {};
  return { ...raw, clientId } as ClientConfig;
}

// ---------------------------------------------------------------------------
// Photo download — fetch from Supabase storage URL
// ---------------------------------------------------------------------------

async function downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // 1. Auth + tenant resolution (tier check is inside requireConsoleSession
    //    which defaults to desktop_console; we override to data_export)
    const gate = await requireConsoleSession(request, null, "data_export");
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId!;
    const exportedBy = gate.session?.email || (gate.isAdmin ? "admin" : "unknown");

    // 2. Fetch all data in parallel (where possible)
    const [quotations, customers, products, payments, auditLogs, photos, config] =
      await Promise.all([
        fetchAllQuotations(clientId),
        fetchAllCustomers(clientId),
        fetchAllProducts(clientId),
        fetchAllPayments(clientId),
        fetchAllAuditLogs(clientId),
        fetchQuotationPhotos(clientId),
        fetchClientConfig(clientId),
      ]);

    // Flatten measured/unmeasured items from quotations for the CSVs
    const allMeasured = quotations.flatMap((q: any) => q.measured_items || []);
    const allUnmeasured = quotations.flatMap((q: any) => q.unmeasured_items || []);

    // 3. Build CSVs
    const csvFiles: Array<{ name: string; content: string }> = [
      { name: "quotations.csv", content: quotationsCsv(quotations) },
      { name: "measured_items.csv", content: measuredItemsCsv(allMeasured) },
      { name: "unmeasured_items.csv", content: unmeasuredItemsCsv(allUnmeasured) },
      { name: "customers.csv", content: customersCsv(customers) },
      { name: "products.csv", content: productsCsv(products) },
      { name: "payments.csv", content: paymentsCsv(payments) },
      { name: "audit_logs.csv", content: auditLogsCsv(auditLogs) },
    ];

    // 4. Build metadata
    const recordCounts: Record<string, number> = {
      quotations: quotations.length,
      measured_items: allMeasured.length,
      unmeasured_items: allUnmeasured.length,
      customers: customers.length,
      products: products.length,
      payments: payments.length,
      audit_logs: auditLogs.length,
      quotation_photos: photos.length,
    };
    const metadata = {
      export_timestamp: new Date().toISOString(),
      client_id: clientId,
      company_name: config.companyName || config.appName || clientId,
      exported_by: exportedBy,
      format: "zip",
      record_counts: recordCounts,
      total_records: Object.values(recordCounts).reduce((a, b) => a + b, 0),
      contents: [
        "quotations.csv",
        "measured_items.csv",
        "unmeasured_items.csv",
        "customers.csv",
        "products.csv",
        "payments.csv",
        "audit_logs.csv",
        "quotations/ (PDF files)",
        "quotation_photos/ (site photos)",
        "metadata.json",
      ],
    };

    // 5. Build and stream the ZIP
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${clientId}_export_${stamp}.zip`;

    // Create a passthrough stream that archiver writes to and the response reads from
    const passthrough = new Readable({ read() {} });

    const archive = archiver("zip", {
      zlib: { level: 6 }, // balanced compression
    });

    // Pipe archiver output into the passthrough
    archive.pipe(passthrough);

    // Handle archiver errors
    archive.on("error", (err) => {
      console.error(`[export-all] archiver error: ${err.message}`);
      passthrough.destroy(err);
    });

    // Add metadata
    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

    // Add CSVs
    for (const csv of csvFiles) {
      archive.append(csv.content, { name: csv.name });
    }

    // Generate PDFs for each quotation (chunked to avoid timeout)
    const PDF_DIR = "quotations/";
    let pdfCount = 0;
    let pdfErrors = 0;

    // Process PDFs in batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < quotations.length; i += BATCH_SIZE) {
      const batch = quotations.slice(i, i + BATCH_SIZE);
      const pdfResults = await Promise.allSettled(
        batch.map(async (q: any) => {
          const pdfData = buildPdfData(q, config, clientId);
          const bytes = await buildQuotationPdf(pdfData);
          const safeName = (q.quote_no || q.id || `quote_${i}`)
            .replace(/[^a-zA-Z0-9_-]/g, "_");
          archive.append(Buffer.from(bytes), {
            name: `${PDF_DIR}${safeName}.pdf`,
          });
          return true;
        }),
      );
      for (const r of pdfResults) {
        if (r.status === "fulfilled" && r.value) pdfCount++;
        else pdfErrors++;
      }
    }

    // Add quotation photos (download from storage, add to zip)
    let photoCount = 0;
    let photoErrors = 0;
    const PHOTOS_DIR = "quotation_photos/";

    if (photos.length > 0) {
      // Process photos in batches of 10
      const PHOTO_BATCH = 10;
      for (let i = 0; i < photos.length; i += PHOTO_BATCH) {
        const batch = photos.slice(i, i + PHOTO_BATCH);
        const photoResults = await Promise.allSettled(
          batch.map(async (p: any) => {
            const url = p.public_url;
            if (!url) return false;
            const buf = await downloadPhoto(url);
            if (!buf) return false;
            const ext = (p.mime_type || "image/jpeg").split("/")[1]?.replace("jpeg", "jpg") || "jpg";
            const safeName = (p.file_name || `photo_${p.id}`)
              .replace(/[^a-zA-Z0-9._-]/g, "_");
            const safeQuote = (p.quotation_id || "unknown")
              .replace(/[^a-zA-Z0-9_-]/g, "_");
            archive.append(buf, {
              name: `${PHOTOS_DIR}${safeQuote}/${safeName}`,
            });
            return true;
          }),
        );
        for (const r of photoResults) {
          if (r.status === "fulfilled" && r.value) photoCount++;
          else photoErrors++;
        }
      }
    }

    // Finalize the archive
    await archive.finalize();

    // 6. Log the export event
    const logPayload: Record<string, any> = {
      client_id: clientId,
      exported_by: exportedBy,
      format: "zip",
      record_counts: recordCounts,
    };
    // file_size_bytes will be unknown until the stream finishes; log without it
    supaPost("data_export_log", logPayload).catch((err) => {
      console.error(`[export-all] failed to log export: ${err.message}`);
    });

    // 7. Stream the response
    // Convert the passthrough to a web ReadableStream for Next.js
    const webStream = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        passthrough.on("end", () => {
          controller.close();
        });
        passthrough.on("error", (err) => {
          controller.error(err);
        });
      },
    });

    console.log(
      `[export-all] client=${clientId} quotes=${quotations.length} ` +
      `pdfs=${pdfCount}(${pdfErrors} err) photos=${photoCount}(${photoErrors} err) ` +
      `customers=${customers.length} products=${products.length} ` +
      `payments=${payments.length} audit=${auditLogs.length}`,
    );

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: any) {
    console.error(`[export-all] fatal: ${String(e?.message ?? e)}`);
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
