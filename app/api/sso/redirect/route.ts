import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    
    // Allow both admin and customer roles - admins can access client apps
    if (session.role !== "customer" && session.role !== "admin") {
      return NextResponse.redirect(new URL("/login?error=not_customer", request.url));
    }
    
    const { searchParams } = new URL(request.url);
    const targetClientId = searchParams.get("client_id");
    
    if (!targetClientId) {
      return NextResponse.redirect(new URL("/login?error=no_client_id", request.url));
    }
    
    // Verify user has access to this client
    const supabase = getSupabaseServer();
    const { data: client } = await supabase
      .from("clients")
      .select("id, config")
      .eq("id", targetClientId)
      .maybeSingle();
    
    if (!client) {
      return NextResponse.redirect(new URL("/login?error=client_not_found", request.url));
    }
    
    const config = client.config || {};
    const userEmail = session.email.trim().toLowerCase();
    
    // Platform admins bypass per-client email checks
    if (session.role !== "admin") {
      const adminEmails = (config.adminEmails || []).map((e: string) => e.trim().toLowerCase());
      const hasAccess = adminEmails.includes(userEmail) || 
        (config.companyEmail?.trim().toLowerCase() === userEmail);
      
      if (!hasAccess) {
        return NextResponse.redirect(new URL("/login?error=no_access", request.url));
      }
    }
    
    // Generate SSO token with session binding
    const { SignJWT } = await import("jose");
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
      return NextResponse.redirect(new URL("/login?error=config_error", request.url));
    }
    const encodedKey = new TextEncoder().encode(secretKey);
    
    // Generate unique JTI for one-time use tracking
    const jti = crypto.randomUUID();
    const sessionId = session.session_id || "unknown";
    
    // Store JTI in database for one-time use validation (5 min TTL)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase
      .from("sso_tokens")
      .insert({
        jti,
        session_id: sessionId,
        client_id: targetClientId,
        email: session.email,
        expires_at: expiresAt,
        used: false,
      });
    
    const ssoToken = await new SignJWT({
      role: "customer",
      email: session.email,
      client_id: targetClientId,
      type: "sso",
      session_id: sessionId,
      jti,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .setIssuer("https://jqjxhhgfwdzckijnnede.supabase.co/auth/v1")
      .sign(encodedKey);
    
    // Get app slug from config
    const appSlug = targetClientId; // fallback
    const appName = config.appName;
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const finalSlug = slugify(appName || targetClientId);
    
    // Redirect with query params and fragment
    // Use request origin so local dev (localhost:3000 / :3100) redirects correctly
    // Can be overridden via APP_ORIGIN env var for proxy deployments
    const appOrigin = process.env.APP_ORIGIN || request.nextUrl.origin;
    const flutterUrl = `${appOrigin}/upvc/${finalSlug}?client=${encodeURIComponent(targetClientId)}&auto_login=true#sso_token=${encodeURIComponent(ssoToken)}`;
    
    return NextResponse.redirect(flutterUrl);
  } catch (e: any) {
    console.error("SSO redirect error:", e);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}