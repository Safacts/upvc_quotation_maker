import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet, supaPatch } from "@/lib/supabase";
import { parseClientConfig } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { client_id, app_name } = await request.json();
    if (!client_id) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }

    // Allow admins to build for anyone, but customers can only build for themselves.
    if (session.role !== "admin" && session.client_id !== client_id) {
       return NextResponse.json({ error: "Forbidden: You can only build your own app." }, { status: 403 });
    }

    const clientDataArray = await supaGet("clients", { select: "config", id: `eq.${client_id}` });
    const clientData = clientDataArray && clientDataArray.length > 0 ? clientDataArray[0] : null;
    
    if (!clientData) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const rawConfig = clientData.config || {};
    const lastTriggered = rawConfig.lastBuildTriggeredAt;

    if (lastTriggered) {
      const now = new Date().getTime();
      const diffMinutes = (now - new Date(lastTriggered).getTime()) / 60000;
      if (diffMinutes < 10) {
        return NextResponse.json(
          { error: `A build is already in progress. Please wait ${Math.ceil(10 - diffMinutes)} more minutes before triggering another.` }, 
          { status: 429 }
        );
      }
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER; // e.g. "myorg"
    const repoName = process.env.GITHUB_REPO_NAME;   // e.g. "upvc_quotation_maker"

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json({ 
        error: "GitHub environment variables (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME) not configured on server." 
      }, { status: 500 });
    }

    // Dispatch GitHub Action build event
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "build-client-apk",
        client_payload: {
          client_id,
          app_name: app_name || `${client_id} UPVC Quote`
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `GitHub API error: ${errText}` }, { status: res.status });
    }

    // Save timestamp to prevent spam
    const updatedConfig = { ...rawConfig, lastBuildTriggeredAt: new Date().toISOString() };
    await supaPatch("clients", { id: `eq.${client_id}` }, { config: updatedConfig });

    return NextResponse.json({ success: true, message: `APK build triggered for ${client_id}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
