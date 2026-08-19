import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { jwtVerify } from "jose";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body.token;
    
    if (!token) {
      return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
    }
    
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
      return NextResponse.json({ valid: false, error: "JWT_SECRET not configured" }, { status: 500 });
    }
    const encodedKey = new TextEncoder().encode(secretKey);
    
    // Verify JWT
    let payload: any;
    try {
      const result = await jwtVerify(token, encodedKey, {
        algorithms: ["HS256"],
        issuer: "https://gumpmnbjdtzajhysnnaz.supabase.co/auth/v1",
      });
      payload = result.payload;
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Invalid token signature" }, { status: 401 });
    }
    
    // Validate claims
    if (payload.type !== "sso") {
      return NextResponse.json({ valid: false, error: "Invalid token type" }, { status: 401 });
    }
    
    if (!payload.jti || !payload.client_id || !payload.session_id) {
      return NextResponse.json({ valid: false, error: "Missing required claims" }, { status: 401 });
    }
    
    // Check if token exists and not used
    const supabase = getSupabaseServer();
    const { data: tokenRecord, error } = await supabase
      .from("sso_tokens")
      .select("*")
      .eq("jti", payload.jti)
      .eq("client_id", payload.client_id)
      .eq("session_id", payload.session_id)
      .maybeSingle();
    
    if (error || !tokenRecord) {
      return NextResponse.json({ valid: false, error: "Token not found or expired" }, { status: 401 });
    }
    
    if (tokenRecord.used) {
      return NextResponse.json({ valid: false, error: "Token already used" }, { status: 401 });
    }
    
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "Token expired" }, { status: 401 });
    }
    
    // Mark token as used (one-time use)
    await supabase
      .from("sso_tokens")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("jti", payload.jti);
    
    // Verify client exists and is active
    const { data: client } = await supabase
      .from("clients")
      .select("id, is_active, config")
      .eq("id", payload.client_id)
      .maybeSingle();
    
    if (!client) {
      return NextResponse.json({ valid: false, error: "Client not found" }, { status: 404 });
    }
    
    if (!client.is_active) {
      return NextResponse.json({ valid: false, error: "Client inactive" }, { status: 403 });
    }
    
    return NextResponse.json({ 
      valid: true, 
      client_id: payload.client_id,
      email: payload.email,
      session_id: payload.session_id,
    });
  } catch (e: any) {
    console.error("SSO validate error:", e);
    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}