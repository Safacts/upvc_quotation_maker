import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, supaPatch, supaDelete } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { sendAdminCompose } from "@/lib/mail";
import Groq from "groq-sdk";
import crypto from "crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

function sha256(str: string) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

const PROTECTED_CLIENTS = ["venkateshwara", "akshaya upvc", "kprupvc"];

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
];

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return json({ error: "not authorized" }, 403);
    }

    const { prompt, history = [] } = await request.json();
    if (!prompt) {
      return json({ error: "prompt is required" }, 400);
    }

    if (!process.env.GROQ_API_KEY) {
      return json({ error: "GROQ_API_KEY is not configured on the server." }, 500);
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const messages: any[] = [
      {
        role: "system",
        content: `You are Tara, an AI assistant for the Vitharn UPVC Quotation Maker platform admin.
Your job is to help the admin automatically create client accounts, read existing clients as templates, delete clients, and send emails.

CRITICAL INSTRUCTIONS:
1. NEVER INVENT DUMMY DATA: If the user says "create a client" but doesn't provide all the necessary details (company name, app name, email, password, etc.), DO NOT call the create_client tool with made-up information. Instead, ask the user follow-up questions to gather the missing details. Only execute the tool when you have all the facts.
2. BE SMART & AGENTIC: Use get_client and list_clients to look up previous clients. If the user asks for a setup "like Akshaya" or "standard setup", fetch that client's config first and use it as a template, merging the new details over it. 
3. SECURITY: When deleting a client, you MUST respect the "aiCanDelete" flag. If it is false, you cannot delete them. Never try to modify or delete protected clients: venkateshwara, akshaya upvc, kprupvc. You are permitted to use get_client to read them to use as templates.`,
      },
      ...history,
      { role: "user", content: prompt },
    ];

    const runner = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: tools as any,
      tool_choice: "auto",
    });

    const responseMessage = runner.choices[0].message;
    const toolCalls = responseMessage.tool_calls;
    
    let actionLogs: string[] = [];

    if (toolCalls) {
      messages.push(responseMessage); // Append the assistant's message with tool calls

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
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
            result = JSON.stringify(existing[0].config || {});
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
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: result,
        });
      }

      // Second request to get the final answer from the model
      const secondResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
      });

      return json({ 
        reply: secondResponse.choices[0].message.content,
        logs: actionLogs 
      });
    }

    return json({ reply: responseMessage.content, logs: actionLogs });
  } catch (e: any) {
    console.error("Agent error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
