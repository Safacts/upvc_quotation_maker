import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaCount, supaGetAllPaged, supaPost, supaPatch, supaDelete } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { sendAdminCompose } from "@/lib/mail";
import Groq from "groq-sdk";
import crypto from "crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

const MAX_PROMPT_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_STORED_MESSAGES = 500;
const MAX_STORED_MESSAGE_CHARS = 20_000;
const MAX_IMPORTED_CONVERSATIONS = 50;
const MAX_IMPORTED_MESSAGES = 500;
const SAFE_UPDATE_KEYS = new Set([
  "companyName",
  "appName",
  "companyEmail",
  "adminEmails",
  "quotePrefix",
  "defaultGstPercentage",
  "aiCanDelete",
]);
const SECRET_KEYS = new Set([
  "password",
  "passwordHash",
  "portalPasswordHash",
  "password_hash",
  "bankAccountNo",
  "bankIfsc",
]);
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

function sha256(str: string) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function adminEmail(session: any) {
  return String(session?.email ?? "").trim().toLowerCase();
}

function firstRow(value: any): any | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function chatTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.slice(0, 80) + (compact.length > 80 ? "..." : "");
}

async function getOwnedConversation(id: string, email: string) {
  const rows = await supaGet("tara_conversations", {
    id: `eq.${id}`,
    admin_email: `eq.${email}`,
    select: "id,title,legacy_id,created_at,updated_at",
    limit: 1,
  });
  return firstRow(rows);
}

async function createConversation(
  email: string,
  title: string,
  legacyId?: string,
  updatedAt?: string,
  ignoreDuplicate = false,
) {
  const row: Record<string, any> = {
    admin_email: email,
    title: title || "New Chat",
  };
  if (legacyId) row.legacy_id = legacyId;
  if (updatedAt) {
    row.created_at = updatedAt;
    row.updated_at = updatedAt;
  }
  const created = firstRow(await supaPost(
    "tara_conversations",
    row,
    ignoreDuplicate ? "return=representation,resolution=ignore-duplicates" : undefined,
  ));
  if (!created?.id || !isUuid(created.id)) {
    throw new Error("Tara conversation could not be created.");
  }
  return created;
}

async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  logs?: string[],
) {
  await supaPost("tara_messages", {
    conversation_id: conversationId,
    role,
    content: content.slice(0, MAX_STORED_MESSAGE_CHARS),
    ...(logs && logs.length > 0 ? { tool_logs: logs } : {}),
  });
  await supaPatch(
    "tara_conversations",
    { id: `eq.${conversationId}` },
    { updated_at: new Date().toISOString() },
  );
}

async function importLegacyConversations(email: string, rawConversations: unknown) {
  if (!Array.isArray(rawConversations)) {
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;
  for (const raw of rawConversations.slice(0, MAX_IMPORTED_CONVERSATIONS)) {
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const source = raw as any;
    const legacyId = typeof source.id === "string" ? source.id.trim().slice(0, 120) : "";
    if (!legacyId) {
      skipped++;
      continue;
    }

    const existing = await supaGet("tara_conversations", {
      admin_email: `eq.${email}`,
      legacy_id: `eq.${legacyId}`,
      select: "id",
      limit: 1,
    });
    if (firstRow(existing)) {
      skipped++;
      continue;
    }

    const title = typeof source.title === "string"
      ? source.title.replace(/\s+/g, " ").trim().slice(0, 200) || "New Chat"
      : "New Chat";
    const localUpdatedAt = Number(source.updatedAt);
    const localDate = Number.isFinite(localUpdatedAt) && localUpdatedAt > 0
      ? new Date(localUpdatedAt)
      : null;
    const updatedAt = localDate && !Number.isNaN(localDate.getTime())
      ? localDate.toISOString()
      : undefined;
    const conversation = await createConversation(email, title, legacyId, updatedAt, true).catch(async (error) => {
      // A second tab may have won the unique legacy_id race between the
      // existence check and insert. Re-read it instead of duplicating messages.
      const concurrent = await supaGet("tara_conversations", {
        admin_email: `eq.${email}`,
        legacy_id: `eq.${legacyId}`,
        select: "id",
        limit: 1,
      });
      if (firstRow(concurrent)) return null;
      throw error;
    });
    if (!conversation) {
      skipped++;
      continue;
    }
    const rawMessages = Array.isArray(source.messages) ? source.messages : [];
    const messageRows = rawMessages
      .slice(0, MAX_IMPORTED_MESSAGES)
      .filter((message: any) => message && typeof message === "object")
      .map((message: any) => {
        const role = message.role === "agent" || message.role === "assistant"
          ? "assistant"
          : message.role === "user" ? "user" : null;
        const content = typeof message.content === "string"
          ? message.content.trim().slice(0, MAX_STORED_MESSAGE_CHARS)
          : "";
        if (!role || !content) return null;
        const logs = Array.isArray(message.logs)
          ? message.logs.filter((log: unknown): log is string => typeof log === "string").slice(0, 50)
          : [];
        return {
          conversation_id: conversation.id,
          role,
          content,
          ...(logs.length > 0 ? { tool_logs: logs } : {}),
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;
    if (messageRows.length > 0) {
      await supaPost("tara_messages", messageRows);
    }
    imported++;
  }

  return { imported, skipped };
}

function safeClientConfig(config: Record<string, any>) {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (!SECRET_KEYS.has(key)) safe[key] = value;
  }
  return safe;
}

const PROTECTED_CLIENTS = ["venkateshwara", "kprupvc"];

// Tools definition for Groq
const tools = [
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Creates a new client account and returns the client ID. You can pass a full config template via additionalConfig.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "A short, URL-friendly unique identifier for the client (e.g. 'demo-upvc')." },
          appName: { type: "string", description: "The short name of the app for this client." },
          companyName: { type: "string", description: "The full business name of the client." },
          email: { type: "string", description: "The login email for the client." },
          password: { type: "string", description: "The plaintext password for the client." },
          additionalConfig: { type: "object", description: "Optional object containing any additional full configuration (e.g., GST details, terms, branding) to store in the client's config." }
        },
        required: ["clientId", "appName", "companyName", "email", "password"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client",
      description: "Reads the full JSON configuration of an existing client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID to read." }
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Lists all clients currently in the database, including their IDs, names, and whether they can be deleted.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client",
      description: "Deletes a client account completely.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID to delete." }
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Sends an email to a user.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string", description: "The plaintext body of the email." },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Updates an existing client's configuration (e.g., enabling features like Ops Console).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID to update." },
          updates: { type: "object", description: "The specific configuration fields to update or merge into the client's config." }
        },
        required: ["clientId", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_quotes",
      description: "Counts and/or lists quotations generated by one client. Use countOnly=true when the admin asks how many quotations a client has made.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID, for example kprupvc." },
          status: { type: "string", description: "Optional quotation status filter." },
          countOnly: { type: "boolean", description: "Return the exact count without loading quotation rows." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Maximum recent quotations to return when countOnly is false." },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_metrics",
      description: "Builds an evidence-based usage report for one client: exact quotation count, status breakdown, totals, date range, recent activity, and data-quality warnings.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID to analyze." },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_platform_report",
      description: "Produces a bounded platform-wide research snapshot for the admin: client adoption, quotation volume, status mix, monetary totals, recent activity, and data-quality warnings.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", minimum: 1, maximum: 3650, description: "Lookback window for recent activity; defaults to 30 days." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_health",
      description: "Checks current server-side system condition without exposing secrets: database reachability/latency, table counts, required environment-variable presence, and deployment metadata.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin" || !adminEmail(session)) {
      return json({ error: "not authorized" }, 403);
    }
    const email = adminEmail(session);
    const conversationId = new URL(request.url).searchParams.get("conversationId");

    if (!conversationId) {
      const conversations = await supaGet("tara_conversations", {
        admin_email: `eq.${email}`,
        select: "id,title,legacy_id,created_at,updated_at",
        order: "updated_at.desc",
        limit: MAX_IMPORTED_CONVERSATIONS,
      });
      return json({ conversations: Array.isArray(conversations) ? conversations : [] });
    }
    if (!isUuid(conversationId)) {
      return json({ error: "invalid conversation id" }, 400);
    }

    const conversation = await getOwnedConversation(conversationId, email);
    if (!conversation) return json({ error: "conversation not found" }, 404);
    const rows = await supaGet("tara_messages", {
      conversation_id: `eq.${conversationId}`,
      select: "id,role,content,tool_logs,created_at",
      order: "created_at.desc",
      limit: MAX_STORED_MESSAGES,
    });
    const messages = Array.isArray(rows) ? [...rows].reverse() : [];
    return json({ conversation, messages });
  } catch (e: any) {
    console.error("Tara conversation read error:", e);
    return json({ error: "Unable to load Tara conversations right now." }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin" || !adminEmail(session)) {
      return json({ error: "not authorized" }, 403);
    }
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!isUuid(conversationId)) return json({ error: "invalid conversation id" }, 400);
    const email = adminEmail(session);
    if (!await getOwnedConversation(conversationId, email)) {
      return json({ error: "conversation not found" }, 404);
    }
    await supaDelete("tara_conversations", {
      id: `eq.${conversationId}`,
      admin_email: `eq.${email}`,
    });
    return json({ ok: true });
  } catch (e: any) {
    console.error("Tara conversation delete error:", e);
    return json({ error: "Unable to delete that Tara conversation right now." }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin" || !adminEmail(session)) {
      return json({ error: "not authorized" }, 403);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    const email = adminEmail(session);
    const rateKey = email;
    const now = Date.now();
    const window = requestWindows.get(rateKey);
    if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
      requestWindows.set(rateKey, { startedAt: now, count: 1 });
    } else if (window.count >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many Tara requests. Please wait a minute and try again." },
        { status: 429, headers: { ...CORS_HEADERS, "Retry-After": "60" } },
      );
    } else {
      window.count += 1;
    }

    if (body?.action === "import") {
      const result = await importLegacyConversations(email, body.conversations);
      return json(result);
    }

    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return json({ error: "prompt is required" }, 400);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: `prompt is too long (maximum ${MAX_PROMPT_CHARS} characters)` }, 413);
    }

    if (!process.env.GROQ_API_KEY) {
      return json({ error: "GROQ_API_KEY is not configured on the server." }, 500);
    }

    const requestedConversationId = body?.conversationId;
    let conversation: any;
    if (requestedConversationId === undefined || requestedConversationId === null || requestedConversationId === "") {
      conversation = await createConversation(email, chatTitle(prompt));
    } else {
      if (!isUuid(requestedConversationId)) return json({ error: "invalid conversation id" }, 400);
      conversation = await getOwnedConversation(requestedConversationId, email);
      if (!conversation) return json({ error: "conversation not found" }, 404);
    }

    const storedRows = await supaGet("tara_messages", {
      conversation_id: `eq.${conversation.id}`,
      select: "role,content",
      order: "created_at.desc",
      limit: MAX_HISTORY_MESSAGES,
    });
    const storedHistory = (Array.isArray(storedRows) ? [...storedRows].reverse() : [])
      .filter((item: any) => (item?.role === "user" || item?.role === "assistant") && typeof item.content === "string")
      .map((item: any) => ({ role: item.role, content: item.content.slice(0, MAX_STORED_MESSAGE_CHARS) }));
    await saveMessage(conversation.id, "user", prompt);

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const messages: any[] = [
      {
        role: "system",
        content: `You are Tara, an AI assistant for the Vitharn UPVC Quotation Maker platform admin.
Your job is to help the admin automatically create client accounts, read existing clients as templates, delete clients, and send emails.
You can inspect usage with list_quotes, detailed client performance with get_client_metrics, platform research with get_platform_report, and current infrastructure condition with get_system_health. When asked for a number or current condition, call the relevant tool first; never claim that data is unavailable before trying it. Clearly label exact database facts, bounded/partial samples, and inferences.

CRITICAL INSTRUCTIONS:
1. NEVER INVENT DUMMY DATA: If the user says "create a client" but doesn't provide all the necessary details (company name, app name, email, password, etc.), DO NOT call the create_client tool with made-up information. Instead, ask the user follow-up questions to gather the missing details. Only execute the tool when you have all the facts.
2. BE SMART & AGENTIC: Use get_client and list_clients to look up previous clients. If the user asks for a setup "like Akshaya" or "standard setup", fetch that client's config first and use it as a template, merging the new details over it. 
3. SECURITY: When deleting or updating a client, you MUST respect the "aiCanDelete" flag for deletions. Never try to modify or delete protected clients: venkateshwara, kprupvc. You are permitted to use get_client to read them to use as templates.`,
      },
      ...storedHistory,
      { role: "user", content: prompt },
    ];

    const runner = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages,
      tools: tools as any,
      // Do not let the model answer evidence questions from the client list alone.
      // Force the corresponding database-backed report for the common admin intents.
      tool_choice: (() => {
        const p = String(prompt).toLowerCase();
        const hasSpecificClient = /kprupvc|venkateshwara|akshaya|vaishnavi|instant/.test(p);
        const forced = p.includes("conversion") || p.includes("which clients") || p.includes("actually using")
          ? "get_platform_report"
          : p.includes("system healthy") || p.includes("system health") || p.includes("current condition")
            ? "get_system_health"
            : p.includes("incomplete") || p.includes("suspicious") || p.includes("which clients") || p.includes("actually using")
              ? "get_platform_report"
              : (p.includes("how active") || p.includes("usage")) && hasSpecificClient
                ? "get_client_metrics"
              : null;
        return forced ? { type: "function", function: { name: forced } } : "auto";
      })(),
    });

    const responseMessage = runner.choices[0].message;
    const toolCalls = responseMessage.tool_calls;
    
    let actionLogs: string[] = [];

    if (toolCalls) {
      messages.push(responseMessage); // Append the assistant's message with tool calls

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        let args: Record<string, any>;
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: "Error: Tara produced invalid tool arguments; no action was taken.",
          });
          actionLogs.push(`Rejected malformed tool arguments for ${functionName}`);
          continue;
        }
        let result = "";

        if (functionName === "list_clients") {
          const clients = await supaGet("clients", { select: "id,config" });
          if (clients && clients.length > 0) {
            const summary = clients.map((c: any) => ({
              id: c.id,
              companyName: c.config?.companyName || "Unknown",
              aiCanDelete: c.config?.aiCanDelete ?? true
            }));
            result = JSON.stringify(summary);
            actionLogs.push(`Listed ${clients.length} clients`);
          } else {
            result = "No clients found.";
          }
        } else if (functionName === "get_client") {
          const { clientId } = args;
          const existing = await supaGet("clients", { id: "eq." + clientId });
          if (existing && existing.length > 0) {
            result = JSON.stringify(safeClientConfig(existing[0].config || {}));
            actionLogs.push(`Read client: ${clientId}`);
          } else {
            result = "Error: Client not found.";
          }
        } else if (functionName === "delete_client") {
          const { clientId } = args;
          if (PROTECTED_CLIENTS.includes(clientId.toLowerCase())) {
            result = "Error: Cannot delete protected client.";
            actionLogs.push(`Error: Blocked deletion of protected client ${clientId}`);
          } else {
            const existing = await supaGet("clients", { id: "eq." + clientId });
            if (!existing || existing.length === 0) {
              result = "Error: Client not found.";
            } else {
              const config = existing[0].config || {};
              if (config.aiCanDelete === false) {
                result = "Error: This client is locked by the 'aiCanDelete: false' security flag and cannot be deleted by the AI agent.";
                actionLogs.push(`Error: Security lock prevented deletion of ${clientId}`);
              } else {
                try {
                  await supaDelete("clients", { id: "eq." + clientId });
                  result = `Success: Deleted client ${clientId}.`;
                  actionLogs.push(`Deleted client: ${clientId}`);
                } catch (e: any) {
                  result = "DB Error: " + String(e.message);
                }
              }
            }
          }
        } else if (functionName === "create_client") {
          const { clientId, appName, companyName, email, password, additionalConfig = {} } = args;
          if (PROTECTED_CLIENTS.includes(clientId.toLowerCase())) {
            result = "Error: Cannot modify protected client.";
          } else {
            // Check if client exists
            const existing = await supaGet("clients", { id: "eq." + clientId });
            if (existing && existing.length > 0) {
              result = "Error: Client ID already exists.";
            } else {
              const hash = sha256(password);
              
              // Ensure aiCanDelete is true by default for new clients, unless explicitly passed as false
              if (additionalConfig.aiCanDelete === undefined) {
                additionalConfig.aiCanDelete = true;
              }

              // Insert client
              const config = {
                ...additionalConfig,
                clientId,
                appName,
                companyName,
                adminEmails: [email],
                portalPasswordHash: hash,
                isActive: true,
              };
              try {
                await supaPost("clients", {
                  id: clientId,
                  config,
                  password_hash: hash,
                  is_active: true,
                });
                
                result = `Success: Created client ${clientId} with email ${email}.`;
                actionLogs.push(`Created client: ${companyName} (${clientId})`);
              } catch (e: any) {
                result = "DB Error: " + String(e.message);
              }
            }
          }
        } else if (functionName === "send_email") {
          try {
            await sendAdminCompose({ to: args.to, subject: args.subject, text: args.body });
            result = "Success: Email sent.";
            actionLogs.push(`Sent email to: ${args.to}`);
          } catch (e: any) {
            result = "Mail Error: " + String(e.message);
          }
        } else if (functionName === "update_client") {
          const { clientId, updates } = args;
          if (typeof clientId !== "string" || !clientId.trim() || !updates || typeof updates !== "object" || Array.isArray(updates)) {
            result = "Error: clientId and a plain updates object are required.";
          } else if (PROTECTED_CLIENTS.includes(clientId.toLowerCase())) {
            result = "Error: Protected clients cannot be modified by Tara. Use the explicit admin controls.";
            actionLogs.push(`Error: Blocked modification of protected client ${clientId}`);
          } else {
            const existing = await supaGet("clients", { id: "eq." + clientId });
            if (!existing || existing.length === 0) {
              result = "Error: Client not found.";
            } else {
              const currentConfig = existing[0].config || {};
              const rejected = Object.keys(updates).filter((key) => !SAFE_UPDATE_KEYS.has(key));
              if (rejected.length > 0) {
                result = `Error: These fields cannot be changed by Tara: ${rejected.join(", ")}. Use the protected admin billing/security controls.`;
                actionLogs.push(`Rejected unsafe update for ${clientId}: ${rejected.join(", ")}`);
                messages.push({
                  tool_call_id: toolCall.id,
                  role: "tool",
                  name: functionName,
                  content: result,
                });
                continue;
              }
              const newConfig = { ...currentConfig, ...updates };
              try {
                await supaPatch("clients", { id: "eq." + clientId }, { config: newConfig });
                result = `Success: Updated client ${clientId}.`;
                actionLogs.push(`Updated config for client: ${clientId}`);
              } catch (e: any) {
                result = "DB Error: " + String(e.message);
              }
            }
          }
        } else if (functionName === "list_quotes") {
          const clientId = String(args.clientId || "").trim();
          if (!clientId) {
            result = "Error: clientId is required.";
          } else {
            const statusFilter = args.status
              ? { status: "eq." + String(args.status).trim() }
              : {};

            try {
              const count = await supaCount("quotations", {
                client_id: "eq." + clientId,
                ...statusFilter,
              });
              if (args.countOnly === true) {
                result = JSON.stringify({ clientId, count });
              } else {
                const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
                const rows = await supaGet("quotations", {
                  client_id: "eq." + clientId,
                  ...statusFilter,
                  select: "id,quote_no,date,customer_name,status,grand_total,created_at",
                  order: "created_at.desc",
                  limit,
                });
                result = JSON.stringify({ clientId, count, quotations: rows });
              }
              actionLogs.push(`Read quotation usage: ${clientId} (${count})`);
            } catch (e: any) {
              result = "DB Error: " + String(e.message);
            }
          }
        } else if (functionName === "get_client_metrics") {
          const clientId = String(args.clientId || "").trim();
          if (!clientId) {
            result = "Error: clientId is required.";
          } else {
            try {
              const clients = await supaGet("clients", { id: "eq." + clientId, select: "id,config,is_active,created_at,updated_at" });
              if (!Array.isArray(clients) || clients.length === 0) {
                result = "Error: Client not found.";
              } else {
                const exactCount = await supaCount("quotations", { client_id: "eq." + clientId });
                const sample = await supaGetAllPaged("quotations", {
                  client_id: "eq." + clientId,
                  select: "id,quote_no,date,customer_name,status,grand_total,created_at",
                  order: "created_at.desc",
                }, 500, 5000);
                const statusBreakdown: Record<string, number> = {};
                const convertedStatuses = new Set(["approved", "in production", "dispatched", "installed", "invoiced", "paid"]);
                let converted = 0;
                let totalValue = 0;
                let missingCustomer = 0;
                for (const q of sample.rows) {
                  const status = String(q.status || "unknown").toLowerCase();
                  statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
                  if (convertedStatuses.has(status)) converted++;
                  totalValue += Number(q.grand_total) || 0;
                  if (!String(q.customer_name || "").trim()) missingCustomer++;
                }
                const dates = sample.rows.map((q: any) => String(q.date || q.created_at || "")).filter(Boolean).sort();
                result = JSON.stringify({
                  clientId,
                  client: { id: clients[0].id, config: safeClientConfig(clients[0].config || {}), isActive: clients[0].is_active, createdAt: clients[0].created_at, updatedAt: clients[0].updated_at },
                  quotations: { exactCount, analyzedRows: sample.rows.length, sampleTruncated: sample.truncated, statusBreakdown, conversion: { convertedInAnalyzedRows: converted, rateInAnalyzedRows: sample.rows.length ? Number((converted / sample.rows.length * 100).toFixed(2)) : 0, definition: "approved or later lifecycle status; this is not a payment-confirmed revenue rate" }, summedGrandTotal: Number(totalValue.toFixed(2)), firstDate: dates[0] || null, lastDate: dates.at(-1) || null, recent: sample.rows.slice(0, 20) },
                  dataQuality: { rowsMissingCustomerName: missingCustomer, note: sample.truncated ? "Totals and status breakdown are limited to the first 5000 rows; exactCount remains exact." : null },
                });
                actionLogs.push(`Built client metrics: ${clientId}`);
              }
            } catch (e: any) {
              result = "DB Error: " + String(e.message);
            }
          }
        } else if (functionName === "get_platform_report") {
          try {
            const days = Math.min(Math.max(Number(args.days) || 30, 1), 3650);
            const since = new Date(Date.now() - days * 86400000).toISOString();
            const clients = await supaGet("clients", { select: "id,config,is_active,created_at,updated_at" });
            const exactQuoteCount = await supaCount("quotations");
            const sample = await supaGetAllPaged("quotations", {
              select: "id,client_id,quote_no,date,customer_name,status,grand_total,created_at",
              order: "created_at.desc",
            }, 500, 5000);
            const byClient: Record<string, { quotations: number; recentQuotations: number; converted: number; totalValue: number; statuses: Record<string, number>; lastActivity: string | null }> = {};
            const convertedStatuses = new Set(["approved", "in production", "dispatched", "installed", "invoiced", "paid"]);
            const globalStatuses: Record<string, number> = {};
            let analyzedValue = 0;
            let recentRows = 0;
            for (const q of sample.rows) {
              const id = String(q.client_id || "unknown");
              const status = String(q.status || "unknown").toLowerCase();
              const value = Number(q.grand_total) || 0;
              const created = String(q.created_at || q.date || "");
              const entry = byClient[id] || { quotations: 0, recentQuotations: 0, converted: 0, totalValue: 0, statuses: {}, lastActivity: null };
              entry.quotations++;
              if (created >= since) { entry.recentQuotations++; recentRows++; }
              if (convertedStatuses.has(status)) entry.converted++;
              entry.totalValue += value;
              entry.statuses[status] = (entry.statuses[status] || 0) + 1;
              if (!entry.lastActivity || created > entry.lastActivity) entry.lastActivity = created;
              byClient[id] = entry;
              globalStatuses[status] = (globalStatuses[status] || 0) + 1;
              analyzedValue += value;
            }
            const warnings: string[] = [];
            if (sample.truncated) warnings.push("Quotation analysis is capped at 5000 rows; exact total count is separate.");
            if (Array.isArray(clients)) {
              for (const c of clients) {
                if (!c.config?.companyName) warnings.push(`Client ${c.id} has no companyName in config.`);
                if (c.is_active === false) warnings.push(`Client ${c.id} is inactive.`);
              }
            }
            result = JSON.stringify({
              generatedAt: new Date().toISOString(), lookbackDays: days,
              clients: { total: Array.isArray(clients) ? clients.length : 0, active: Array.isArray(clients) ? clients.filter((c: any) => c.is_active !== false).length : 0, usageByClient: Object.fromEntries(Object.entries(byClient).map(([id, x]) => [id, { ...x, conversionRateInAnalyzedRows: x.quotations ? Number((x.converted / x.quotations * 100).toFixed(2)) : 0 }])), definition: "converted means approved or later lifecycle status; not payment-confirmed revenue" },
              quotations: { exactTotal: exactQuoteCount, analyzedRows: sample.rows.length, recentRows, globalStatuses, analyzedGrandTotal: Number(analyzedValue.toFixed(2)) },
              warnings,
            });
            actionLogs.push("Built platform research report");
          } catch (e: any) {
            result = "DB Error: " + String(e.message);
          }
        } else if (functionName === "get_system_health") {
          const started = Date.now();
          const requiredEnv = ["GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
          try {
            const [clientCount, quoteCount] = await Promise.all([
              supaCount("clients"),
              supaCount("quotations"),
            ]);
            result = JSON.stringify({
              checkedAt: new Date().toISOString(),
              database: { reachable: true, latencyMs: Date.now() - started, clients: clientCount, quotations: quoteCount },
              configuration: Object.fromEntries(requiredEnv.map((key) => [key, Boolean(process.env[key])])),
              runtime: { node: process.version, vercel: Boolean(process.env.VERCEL), deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null, region: process.env.VERCEL_REGION || null },
            });
            actionLogs.push("Checked system health");
          } catch (e: any) {
            result = JSON.stringify({ checkedAt: new Date().toISOString(), database: { reachable: false, latencyMs: Date.now() - started, error: String(e.message).slice(0, 300) }, configuration: Object.fromEntries(requiredEnv.map((key) => [key, Boolean(process.env[key])])) });
            actionLogs.push("System health detected a database error");
          }
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: result,
        });
      }

      // Second request to get the final answer from the model
      messages.push({
        role: "system",
        content: "FINAL ANSWER EVIDENCE GATE: Answer only from the tool results immediately above. Do not invent, estimate, fill gaps, or repeat a number that is not present in tool output. If the tool returned an error, partial sample, or missing field, say so plainly. Never claim a client is active, paid, healthy, converted, or incomplete unless the tool evidence explicitly supports that exact claim. Do not say a password is missing; credentials are intentionally not exposed. Separate exact facts, sampled/partial analysis, and inference.",
      });
      const secondResponse = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages,
      });

      const reply = String(secondResponse.choices[0].message.content ?? "");
      await saveMessage(conversation.id, "assistant", reply, actionLogs);

      return json({ 
        reply,
        logs: actionLogs,
        conversationId: conversation.id,
      });
    }

    const reply = String(responseMessage.content ?? "");
    await saveMessage(conversation.id, "assistant", reply, actionLogs);
    return json({ reply, logs: actionLogs, conversationId: conversation.id });
  } catch (e: any) {
    console.error("Agent error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
