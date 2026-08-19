import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    
    if (session.role !== "customer") {
      return NextResponse.json({ error: "Only customer sessions can create SSO tokens" }, { status: 403 });
    }
    
    if (!session.client_id) {
      return NextResponse.json({ error: "No client ID in session" }, { status: 400 });
    }
    
    // Generate a short-lived SSO token (5 minutes)
    const { SignJWT } = await import("jose");
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
      return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
    }
    const encodedKey = new TextEncoder().encode(secretKey);
    
    const ssoToken = await new SignJWT({
      role: "customer",
      email: session.email,
      client_id: session.client_id,
      type: "sso",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(encodedKey);
    
    return NextResponse.json({ 
      sso_token: ssoToken,
      client_id: session.client_id,
      email: session.email,
      expires_in: 300
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}