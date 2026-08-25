import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet, supaPatch } from "@/lib/supabase";
import { parseClientConfig } from "@/lib/types";

// In-memory per-instance build lock to close TOCTOU race (single instance atomic)
const buildLocks = new Map<string, number>();
const BUILD_COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { client_id, app_name, version_name, version_code } = await request.json();
    if (!client_id) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }
    // BLACK-HAT FIX: strict input validation to prevent GH Actions script injection via app_name
    const clientId = String(client_id).trim();
    if (!/^[a-zA-Z0-9 _-]{2,80}$/.test(clientId)) {
      return NextResponse.json({ error: "Invalid client_id format" }, { status: 400 });
    }
    if (app_name != null && String(app_name).trim() !== "") {
      const an = String(app_name).trim();
      if (!/^[a-zA-Z0-9 _-]{2,60}$/.test(an)) {
        return NextResponse.json({ error: "Invalid app_name: only letters, numbers, space, _ and - allowed (2-60 chars)" }, { status: 400 });
      }
    }
    if (version_name != null && String(version_name).trim() !== "") {
      if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(version_name).trim())) {
        return NextResponse.json({ error: "Invalid version_name: must be semver like 1.0.0" }, { status: 400 });
      }
    }
    if (version_code != null && String(version_code).trim() !== "") {
      if (!/^[0-9]{1,6}$/.test(String(version_code).trim())) {
        return NextResponse.json({ error: "Invalid version_code: must be 1-6 digit integer" }, { status: 400 });
      }
    }

    // Version-aware build dispatch.
    // The portal sends the version the client CURRENTLY has (version_name / version_code).
    // We bump it for the NEW build: versionCode is simply +1 (or 1 if absent/invalid),
    // and versionName gets its PATCH segment incremented (e.g. "1.0.0" -> "1.0.1").
    // The CI workflow writes appVersionName / appVersionCode / lastBuildVersionCode back
    // into the client config only after the build succeeds — we never write them here.
    const rawCode = Number(version_code);
    const newCode =
      version_code != null && Number.isFinite(rawCode) && rawCode >= 0 ? rawCode + 1 : 1;

    let newName: string | undefined;
    if (version_name != null && String(version_name).trim() !== "") {
      const parts = String(version_name).trim().split(".");
      const lastSegment = Number(parts[parts.length - 1]);
      if (Number.isFinite(lastSegment)) {
        parts[parts.length - 1] = String(lastSegment + 1);
        newName = parts.join(".");
      } else {
        // No numeric last segment — leave the version name unchanged.
        newName = String(version_name);
      }
    }

    // Allow admins to build for anyone, but customers can only build for themselves.
    // Use sanitized clientId for all downstream checks
    if (session.role !== "admin" && session.client_id !== clientId) {
       return NextResponse.json({ error: "Forbidden: You can only build your own app." }, { status: 403 });
    }

    // Atomic in-memory throttle check (closes TOCTOU for concurrent requests on same instance)
    const nowLock = Date.now();
    const lockedUntil = buildLocks.get(clientId);
    if (lockedUntil && nowLock < lockedUntil) {
      return NextResponse.json(
        { error: `A build is already in progress. Please wait ${Math.ceil((lockedUntil - nowLock)/60000)} more minutes before triggering another.` },
        { status: 429 }
      );
    }

    const clientDataArray = await supaGet("clients", { select: "config", id: `eq.${clientId}` });
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
    // Set in-memory lock immediately before external dispatch (atomic for this instance)
    buildLocks.set(clientId, Date.now() + BUILD_COOLDOWN_MS);

    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER; // e.g. "myorg"
    const repoName = process.env.GITHUB_REPO_NAME;   // e.g. "upvc_quotation_maker"

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json({ 
        error: "GitHub environment variables (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME) not configured on server." 
      }, { status: 500 });
    }

    // Dispatch GitHub Action build event - use sanitized values only
    const sanitizedAppName = app_name != null && String(app_name).trim() !== "" ? String(app_name).trim() : `${clientId} UPVC Quote`;
    const clientPayload: Record<string, unknown> = {
      client_id: clientId,
      app_name: sanitizedAppName,
      version_code: newCode,
    };
    if (newName !== undefined) {
      clientPayload.version_name = newName;
    }

    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "build-client-apk",
        client_payload: clientPayload
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      // Release lock on failure so retry is possible
      buildLocks.delete(clientId);
      return NextResponse.json({ error: `GitHub API error: ${errText}` }, { status: res.status });
    }

    // Save timestamp to prevent spam (DB persistence)
    const updatedConfig = { ...rawConfig, lastBuildTriggeredAt: new Date().toISOString() };
    await supaPatch("clients", { id: `eq.${clientId}` }, { config: updatedConfig });

    return NextResponse.json({ success: true, message: `APK build triggered for ${clientId}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
