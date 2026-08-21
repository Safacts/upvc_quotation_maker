import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);
const clientIds = new Set(["vaishnavi", "vaishnaviupvcwindowsanddoors"]);

export async function POST(request: NextRequest) {
  let work = "";
  try {
    const body = await request.json();
    const clientId = String(body?.client_id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clientIds.has(clientId)) {
      return NextResponse.json({ error: "This renderer is Vaishnavi-only." }, { status: 403 });
    }
    const quote = body?.quote;
    if (!quote || !Array.isArray(quote.items)) {
      return NextResponse.json({ error: "Invalid Vaishnavi quotation payload." }, { status: 400 });
    }

    work = await mkdtemp(`${tmpdir()}/vaishnavi-render-`);
    const payload = `${work}/payload.json`;
    const injected = `${work}/page1.svg`;
    const output = `${work}/estimate.pdf`;
    await writeFile(payload, JSON.stringify({ quote }), "utf8");

    const root = process.cwd();
    await run(process.execPath, [
      `${root}/scripts/inject-vaishnavi-svg-data.mjs`,
      "--source", `${root}/src/templates/vaishnavi/page1.svg`,
      "--payload", payload,
      "--output", injected,
    ], { windowsHide: true });
    await run(process.execPath, [
      `${root}/scripts/convert-vaishnavi-svg-to-pdf.mjs`,
      "--source", injected,
      "--source2", `${root}/src/templates/vaishnavi/page2.svg`,
      "--output", output,
    ], { windowsHide: true });

    const pdf = await readFile(output);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=vaishnavi-estimate.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Vaishnavi SVG PDF render failed", error);
    return NextResponse.json({ error: "Vaishnavi PDF rendering failed." }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
