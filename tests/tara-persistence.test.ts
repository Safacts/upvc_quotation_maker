import { beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseCall = {
  op: "get" | "post" | "patch" | "delete";
  table: string;
  qs?: Record<string, unknown>;
  body?: any;
};

let currentSession: any = null;
let calls: SupabaseCall[] = [];
let groqReplies: any[] = [];
let groqInputs: any[] = [];
let conversationRows: any[] = [];
let messageRows: any[] = [];
let nextConversationId = "11111111-1111-4111-8111-111111111111";
let failConversationPatch = false;

vi.mock("@/lib/session", () => ({
  getSession: async () => currentSession,
}));

vi.mock("@/lib/mail", () => ({
  sendAdminCompose: async () => {},
}));

vi.mock("@/lib/supabase", () => ({
  supaGet: async (table: string, qs: Record<string, unknown> = {}) => {
    calls.push({ op: "get", table, qs });
    if (table === "tara_conversations") return conversationRows;
    if (table === "tara_messages") return messageRows;
    return [];
  },
  supaPost: async (table: string, body: any) => {
    calls.push({ op: "post", table, body });
    if (table === "tara_conversations") {
      return [{
        id: nextConversationId,
        title: body.title,
        legacy_id: body.legacy_id || null,
        created_at: body.created_at || "2026-09-12T00:00:00.000Z",
        updated_at: body.updated_at || "2026-09-12T00:00:00.000Z",
      }];
    }
    return [];
  },
  supaPatch: async (table: string, qs: Record<string, unknown>, body: any) => {
    calls.push({ op: "patch", table, qs, body });
    if (failConversationPatch) throw new Error("timestamp update unavailable");
    return [];
  },
  supaDelete: async (table: string, qs: Record<string, unknown>) => {
    calls.push({ op: "delete", table, qs });
    return [];
  },
  supaCount: async () => 0,
  supaGetAllPaged: async () => ({ rows: [], truncated: false }),
}));

vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = {
      completions: {
        create: async (input: any) => {
          groqInputs.push(input);
          return groqReplies.shift() || { choices: [{ message: { content: "fallback" } }] };
        },
      },
    };
    constructor() {}
  },
}));

function request(url: string, method: string, body?: any) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as any;
}

const admin = { role: "admin", email: "Admin@Example.com" };
const conversation = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Existing chat",
  legacy_id: null,
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:01:00.000Z",
};

beforeEach(() => {
  currentSession = admin;
  calls = [];
  groqReplies = [];
  groqInputs = [];
  conversationRows = [];
  messageRows = [];
  nextConversationId = conversation.id;
  failConversationPatch = false;
  process.env.GROQ_API_KEY = "test-groq-key";
  vi.resetModules();
});

describe("Tara persistent conversation API", () => {
  it("lists only conversations for the authenticated normalized admin email", async () => {
    conversationRows = [conversation];
    const { GET } = await import("../app/api/admin/agent/route");
    const response = await GET(request("http://localhost/api/admin/agent", "GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ conversations: [conversation] });
    expect(calls[0]).toMatchObject({
      op: "get",
      table: "tara_conversations",
      qs: expect.objectContaining({ admin_email: "eq.admin@example.com" }),
    });
  });

  it("loads messages in chronological order and does not expose another conversation", async () => {
    conversationRows = [conversation];
    messageRows = [
      { id: "m2", role: "assistant", content: "new", tool_logs: ["done"], created_at: "2026-09-12T00:02:00.000Z" },
      { id: "m1", role: "user", content: "old", tool_logs: null, created_at: "2026-09-12T00:01:00.000Z" },
    ];
    const { GET } = await import("../app/api/admin/agent/route");
    const response = await GET(request(`http://localhost/api/admin/agent?conversationId=${conversation.id}`, "GET"));

    expect(response.status).toBe(200);
    expect((await response.json()).messages.map((row: any) => row.id)).toEqual(["m1", "m2"]);

    conversationRows = [];
    const foreign = await GET(request(`http://localhost/api/admin/agent?conversationId=${conversation.id}`, "GET"));
    expect(foreign.status).toBe(404);
  });

  it("uses server history and persists both sides of a completed response", async () => {
    conversationRows = [conversation];
    messageRows = [{ role: "user", content: "server history", created_at: "2026-09-12T00:01:00.000Z" }];
    groqReplies = [{ choices: [{ message: { content: "saved answer", tool_calls: undefined } }] }];
    const { POST } = await import("../app/api/admin/agent/route");
    const response = await POST(request("http://localhost/api/admin/agent", "POST", {
      conversationId: conversation.id,
      prompt: "current question",
      history: [{ role: "user", content: "forged browser history" }],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reply: "saved answer", conversationId: conversation.id });
    expect(groqInputs[0].messages.slice(-2)).toEqual([
      { role: "user", content: "server history" },
      { role: "user", content: "current question" },
    ]);
    const messagePosts = calls.filter((call) => call.op === "post" && call.table === "tara_messages");
    expect(messagePosts.map((call) => call.body)).toEqual([
      { conversation_id: conversation.id, role: "user", content: "current question" },
      { conversation_id: conversation.id, role: "assistant", content: "saved answer" },
    ]);
  });

  it("returns the completed response when the conversation timestamp update fails", async () => {
    conversationRows = [conversation];
    messageRows = [];
    failConversationPatch = true;
    groqReplies = [{ choices: [{ message: { content: "saved despite timestamp failure" } }] }];
    const { POST } = await import("../app/api/admin/agent/route");
    const response = await POST(request("http://localhost/api/admin/agent", "POST", {
      conversationId: conversation.id,
      prompt: "persist this safely",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: "saved despite timestamp failure",
      conversationId: conversation.id,
    });
  });

  it("imports local chats idempotently using the authenticated admin owner", async () => {
    nextConversationId = "22222222-2222-4222-8222-222222222222";
    const { POST } = await import("../app/api/admin/agent/route");
    const response = await POST(request("http://localhost/api/admin/agent", "POST", {
      action: "import",
      conversations: [{
        id: "legacy-1",
        title: "Old local chat",
        updatedAt: 1757635200000,
        messages: [
          { role: "user", content: "hello" },
          { role: "agent", content: "hi", logs: ["answered"] },
        ],
      }],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 1, skipped: 0 });
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: "get",
        table: "tara_conversations",
        qs: expect.objectContaining({
          admin_email: "eq.admin@example.com",
          legacy_id: "eq.legacy-1",
        }),
      }),
      expect.objectContaining({
        op: "post",
        table: "tara_messages",
        body: [
          expect.objectContaining({ role: "user", content: "hello" }),
          expect.objectContaining({ role: "assistant", content: "hi", tool_logs: ["answered"] }),
        ],
      }),
    ]));
  });

  it("deletes an owned conversation and its cascading messages", async () => {
    conversationRows = [conversation];
    const { DELETE } = await import("../app/api/admin/agent/route");
    const response = await DELETE(request(`http://localhost/api/admin/agent?conversationId=${conversation.id}`, "DELETE"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls.at(-1)).toMatchObject({
      op: "delete",
      table: "tara_conversations",
      qs: {
        id: `eq.${conversation.id}`,
        admin_email: "eq.admin@example.com",
      },
    });
  });
});
