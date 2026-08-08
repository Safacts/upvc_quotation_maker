import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, supaPatch } from "@/lib/supabase";
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
      description: "Creates a new client account and returns the client ID.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "A short, URL-friendly unique identifier for the client (e.g. 'demo-upvc')." },
          appName: { type: "string", description: "The short name of the app for this client." },
          companyName: { type: "string", description: "The full business name of the client." },
          email: { type: "string", description: "The login email for the client." },
          password: { type: "string", description: "The plaintext password for the client." },
        },
        required: ["clientId", "appName", "companyName", "email", "password"],
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

    const { prompt } = await request.json();
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
        content: `You are an AI assistant for the Vitharn UPVC Quotation Maker platform admin.
Your job is to help the admin automatically create client accounts and send emails.
When the user asks you to create a client, always use the create_client tool. Ensure you generate a reasonable clientId if they don't provide one.
After creating a client, you can use the send_email tool to send them their credentials if the user asks you to.
Never try to modify or access protected clients: venkateshwara, akshaya upvc, kprupvc.`,
      },
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

        if (functionName === "create_client") {
          const { clientId, appName, companyName, email, password } = args;
          if (PROTECTED_CLIENTS.includes(clientId.toLowerCase())) {
            result = "Error: Cannot modify protected client.";
          } else {
            // Check if client exists
            const existing = await supaGet("clients", { id: "eq." + clientId });
            if (existing && existing.length > 0) {
              result = "Error: Client ID already exists.";
            } else {
              const hash = sha256(password);
              // Insert client
              const config = {
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
