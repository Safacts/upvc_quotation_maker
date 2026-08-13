import { NextRequest } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/qr/[quotationId] — generate a QR code PNG linking to the quotation page.
 *
 * PUBLIC endpoint, no auth required. Returns image/png.
 * The QR encodes a URL to the public quote page at /quote/<id>.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> },
) {
  try {
    const { quotationId } = await params;

    if (!quotationId || !/^[0-9a-f-]{36}$/i.test(quotationId)) {
      return new Response("Invalid quotation ID", { status: 400 });
    }

    // Build the public quote URL
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://app.vitharn.com";
    const quoteUrl = `${baseUrl}/quote/${quotationId}`;

    const buffer = await QRCode.toBuffer(quoteUrl, {
      type: "png",
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e: any) {
    return new Response("Failed to generate QR code", { status: 500 });
  }
}
