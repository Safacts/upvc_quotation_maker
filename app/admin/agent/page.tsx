"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import "../admin.css";

interface Message {
  id?: string;
  role: "user" | "agent";
  content: string;
  logs?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  legacyId?: string;
}

interface ServerConversation {
  id: string;
  title: string;
  legacy_id?: string | null;
  created_at: string;
  updated_at: string;
}

const LOCAL_CHATS_KEY = "tara_chats";
const MAX_LOCAL_CHATS = 50;
const MAX_PROMPT_CHARS = 4000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUICK_PROMPTS = [
  "How many quotations were made by all clients today?",
  "Can you check if the system is healthy?",
  "List all active clients and their quotation usage.",
  "What can you do as Tara?",
];

function isServerConversationId(value: string | null): value is string {
  return !!value && UUID_PATTERN.test(value);
}

function localTitle(messages: Message[], fallback = "New Chat") {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return fallback;
  const compact = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return compact.slice(0, 80) + (compact.length > 80 ? "..." : "");
}

function parseLocalChats(raw: string | null): ChatSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((session): session is Record<string, any> => !!session && typeof session === "object")
      .map((session) => {
        const id = typeof session.id === "string" ? session.id.trim() : "";
        if (!id || seen.has(id)) return null;
        seen.add(id);
        const messages: Message[] = Array.isArray(session.messages)
          ? session.messages
            .filter((message: any) => message && (message.role === "user" || message.role === "agent"))
            .map((message: any) => ({
              id: typeof message.id === "string" ? message.id : undefined,
              role: message.role,
              content: typeof message.content === "string" ? message.content : "",
              logs: Array.isArray(message.logs)
                ? message.logs.filter((log: unknown): log is string => typeof log === "string").slice(0, 50)
                : undefined,
            }))
            .filter((message: Message) => message.content.trim().length > 0)
          : [];
        return {
          id,
          title: typeof session.title === "string" && session.title.trim()
            ? session.title.trim().slice(0, 200)
            : localTitle(messages),
          messages,
          updatedAt: Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now(),
          legacyId: typeof session.legacyId === "string" ? session.legacyId : undefined,
        };
      })
      .filter((session) => !!session)
      .map((session) => session as ChatSession)
      .slice(0, MAX_LOCAL_CHATS);
  } catch {
    return [];
  }
}

function mapServerConversation(conversation: ServerConversation): ChatSession {
  return {
    id: conversation.id,
    title: conversation.title || "New Chat",
    messages: [],
    updatedAt: Date.parse(conversation.updated_at) || Date.now(),
    legacyId: conversation.legacy_id || undefined,
  };
}

function mapServerMessages(rows: any[]): Message[] {
  return rows
    .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      role: row.role === "assistant" ? "agent" as const : "user" as const,
      content: row.content,
      logs: Array.isArray(row.tool_logs)
        ? row.tool_logs.filter((log: unknown): log is string => typeof log === "string")
        : undefined,
    }));
}

function formatUpdatedAt(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(timestamp));
}

function responseError(data: any, fallback: string) {
  return typeof data?.error === "string" && data.error.trim() ? data.error : fallback;
}

export default function AgentPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [retryingSync, setRetryingSync] = useState(false);
  const didLoadRef = useRef(false);
  const conversationLoadRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChats = async (isRetry = false) => {
    if (isRetry) setRetryingSync(true);
    setLoadingChats(true);
    const localSessions = parseLocalChats(localStorage.getItem(LOCAL_CHATS_KEY));
    const legacySessions = localSessions.filter((session) => !isServerConversationId(session.id));
    let migrationError: string | null = null;

    try {
      if (legacySessions.length > 0) {
        try {
          const importResponse = await fetch("/api/admin/agent", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "import", conversations: legacySessions }),
          });
          if (!importResponse.ok) {
            const importData = await importResponse.json().catch(() => null);
            throw new Error(responseError(importData, "Older chats could not be imported."));
          }
        } catch (error: any) {
          migrationError = error?.message || "Older chats could not be imported.";
        }
      }

      const response = await fetch("/api/admin/agent", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(data, "Unable to load Tara conversations."));
      setChatSessions((data?.conversations || []).map(mapServerConversation));
      setSyncError(migrationError);
    } catch (error: any) {
      setChatSessions(localSessions);
      setSyncError(error?.message || "Tara is offline. Showing cached chats.");
    } finally {
      setHydrated(true);
      setLoadingChats(false);
      setRetryingSync(false);
    }
  };

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadChats();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
    storageTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(chatSessions.slice(0, MAX_LOCAL_CHATS)));
      } catch {
        // Local storage is only a cache; server persistence remains authoritative.
      }
    }, 150);
    return () => {
      if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
    };
  }, [chatSessions, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const focusComposer = () => {
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const startNewChat = () => {
    conversationLoadRef.current += 1;
    setMessages([]);
    setCurrentSessionId(null);
    setLoadingChatId(null);
    setRequestError(null);
    setLastFailedPrompt(null);
    focusComposer();
  };

  const selectChat = async (id: string) => {
    const session = chatSessions.find((chat) => chat.id === id);
    if (!session || loading || loadingChatId === id) return;
    const loadId = conversationLoadRef.current + 1;
    conversationLoadRef.current = loadId;
    setCurrentSessionId(id);
    setLoadingChatId(id);
    setMessages([]);
    setRequestError(null);
    try {
      if (!isServerConversationId(id)) {
        if (conversationLoadRef.current === loadId) setMessages(session.messages);
        return;
      }
      const response = await fetch(`/api/admin/agent?conversationId=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(data, "Unable to load that conversation."));
      if (conversationLoadRef.current === loadId) setMessages(mapServerMessages(data?.messages || []));
    } catch (error: any) {
      if (conversationLoadRef.current === loadId) {
        setMessages(session.messages);
        setSyncError(error?.message || "That conversation could not be loaded.");
      }
    } finally {
      if (conversationLoadRef.current === loadId) setLoadingChatId(null);
    }
  };

  const deleteChat = async (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const session = chatSessions.find((chat) => chat.id === id);
    if (!session || !window.confirm(`Delete the chat "${session.title}"?`)) return;
    const previous = chatSessions;
    const previousMessages = messages;
    const previousSessionId = currentSessionId;
    const wasCurrent = currentSessionId === id;
    if (wasCurrent) conversationLoadRef.current += 1;
    setChatSessions(chatSessions.filter((chat) => chat.id !== id));
    if (wasCurrent) startNewChat();
    if (!isServerConversationId(id)) return;
    try {
      const response = await fetch(`/api/admin/agent?conversationId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(data, "Unable to delete that conversation."));
      setSyncError(null);
    } catch (error: any) {
      setChatSessions(previous);
      if (wasCurrent) {
        conversationLoadRef.current += 1;
        setCurrentSessionId(previousSessionId);
        setMessages(previousMessages);
      }
      setSyncError(error?.message || "That conversation could not be deleted.");
    }
  };

  const sendPrompt = async (userMessage: string, appendUserMessage = true) => {
    const trimmed = userMessage.trim();
    if (!trimmed || loading || loadingChatId) return;
    const nextMessages = appendUserMessage
      ? [...messages, { role: "user" as const, content: trimmed }]
      : messages;
    if (appendUserMessage) setMessages(nextMessages);
    setPrompt("");
    setLoading(true);
    setRequestError(null);
    setLastFailedPrompt(null);

    try {
      const requestBody: Record<string, string> = { prompt: trimmed };
      if (isServerConversationId(currentSessionId)) requestBody.conversationId = currentSessionId;
      const response = await fetch("/api/admin/agent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(data, "Tara could not complete that request."));
      const reply = typeof data?.reply === "string" && data.reply.trim()
        ? data.reply
        : "Tara completed the request without a readable response. Please check the action log.";
      const finalMessages = [
        ...nextMessages,
        { role: "agent" as const, content: reply, logs: Array.isArray(data?.logs) ? data.logs : undefined },
      ];
      setMessages(finalMessages);
      const serverId = typeof data?.conversationId === "string" ? data.conversationId : currentSessionId;
      if (isServerConversationId(serverId)) {
        setCurrentSessionId(serverId);
        setChatSessions((previous) => {
          const existing = previous.find((session) => session.id === serverId);
          const updated: ChatSession = {
            id: serverId,
            title: existing?.title && existing.title !== "New Chat" ? existing.title : localTitle(finalMessages),
            messages: finalMessages,
            updatedAt: Date.now(),
          };
          return [updated, ...previous.filter((session) => session.id !== serverId)];
        });
      }
      setSyncError(null);
    } catch (error: any) {
      const message = error?.message || "Tara could not be reached.";
      setRequestError(message);
      setLastFailedPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendPrompt(prompt);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setRequestError(null);
      setSyncError(null);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const selectedChat = chatSessions.find((session) => session.id === currentSessionId);

  return (
    <div className="admin-shell tara-shell">
      <aside className="tara-sidebar" aria-label="Tara conversation history">
        <div className="tara-sidebar-top">
          <div className="tara-brand">
            <div className="tara-avatar" aria-hidden="true">T</div>
            <div>
              <div className="tara-brand-name">Tara</div>
              <div className="tara-brand-subtitle">Admin operations agent</div>
            </div>
          </div>
          <button type="button" onClick={startNewChat} className="tara-new-chat">
            <span aria-hidden="true">+</span>
            New chat
          </button>
        </div>

        <div className="tara-history-header">
          <span>Recent chats</span>
          {chatSessions.length > 0 && <span className="tara-count">{chatSessions.length}</span>}
        </div>
        <div className="tara-chat-list" aria-busy={loadingChats}>
          {loadingChats && chatSessions.length === 0 && (
            <div className="tara-list-state" aria-label="Loading chat history">Loading history...</div>
          )}
          {!loadingChats && chatSessions.length === 0 && (
            <div className="tara-list-state">No past chats yet. Start with a question below.</div>
          )}
          {chatSessions.map((session) => (
            <div className={`tara-chat-item${currentSessionId === session.id ? " active" : ""}`} key={session.id}>
              <button
                type="button"
                className="tara-chat-select"
                onClick={() => void selectChat(session.id)}
                aria-current={currentSessionId === session.id ? "page" : undefined}
                aria-label={`Open chat ${session.title}`}
                disabled={!!loadingChatId}
              >
                <span className="tara-chat-title">{session.title}</span>
                <time dateTime={new Date(session.updatedAt).toISOString()}>{formatUpdatedAt(session.updatedAt)}</time>
              </button>
              <button
                type="button"
                className="tara-chat-delete"
                onClick={(event) => void deleteChat(session.id, event)}
                aria-label={`Delete chat ${session.title}`}
                title="Delete chat"
              >
                x
              </button>
            </div>
          ))}
        </div>

        <div className="tara-sidebar-bottom">
          <div className="tara-sidebar-note">
            <span className="tara-online-dot" aria-hidden="true" />
            <span>Server history is authoritative</span>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="tara-exit">
            Back to dashboard
          </button>
        </div>
      </aside>

      <main className="admin-main tara-main">
        <header className="tara-header">
          <div>
            <div className="tara-eyebrow">Vitharn operations</div>
            <h1>{selectedChat?.title || "Tara workspace"}</h1>
            <p>Ask Tara to inspect data, run a protected action, or explain what happened.</p>
          </div>
          <div className={`tara-status ${syncError ? "cached" : "ready"}`} aria-label={syncError ? "Showing cached history" : "Connected to server history"}>
            <span className="tara-status-dot" aria-hidden="true" />
            {syncError ? "Cached history" : "Ready"}
          </div>
        </header>

        {syncError && (
          <div className="tara-alert" role="alert">
            <div>
              <strong>{syncError.includes("offline") || syncError.includes("unavailable") ? "Sync is temporarily unavailable" : "Some chats need attention"}</strong>
              <span>{syncError}. Your new messages will still be sent to the server.</span>
            </div>
            <button type="button" onClick={() => void loadChats(true)} disabled={retryingSync}>
              {retryingSync ? "Retrying..." : "Retry sync"}
            </button>
          </div>
        )}

        <div className="tara-transcript" role="log" aria-live="polite" aria-busy={loading} aria-label="Tara conversation">
          {messages.length === 0 && !loadingChatId && (
            <section className="tara-welcome" aria-labelledby="tara-welcome-title">
              <div className="tara-welcome-mark" aria-hidden="true">T</div>
              <div className="tara-eyebrow">Your operations co-pilot</div>
              <h2 id="tara-welcome-title">What should we verify?</h2>
              <p>Tara can look up live platform data, execute allowed client operations, and show the evidence behind each answer.</p>
              <div className="tara-capability-row" aria-label="Tara capabilities">
                <span>Client operations</span>
                <span>Usage reports</span>
                <span>System health</span>
              </div>
              <div className="tara-quick-prompts">
                {QUICK_PROMPTS.map((quickPrompt) => (
                  <button type="button" key={quickPrompt} onClick={() => { setPrompt(quickPrompt); focusComposer(); }}>
                    {quickPrompt}
                  </button>
                ))}
              </div>
            </section>
          )}

          {loadingChatId && (
            <div className="tara-loading-history" role="status">Loading this conversation...</div>
          )}

          {messages.map((message, index) => (
            <div className={`tara-message-row ${message.role}`} key={message.id || `${message.role}-${index}-${message.content.slice(0, 12)}`}>
              <div className="tara-message-meta">{message.role === "user" ? "You" : "Tara"}</div>
              <div className={`tara-message-bubble ${message.role}`}>
                <div className="tara-message-content">{message.content}</div>
                {message.logs && message.logs.length > 0 && (
                  <details className="tara-action-log">
                    <summary>Automated actions ({message.logs.length})</summary>
                    <div>
                      {message.logs.map((log, actionIndex) => (
                        <div className={log.toLowerCase().includes("error") ? "error" : "success"} key={`${log}-${actionIndex}`}>
                          <span aria-hidden="true">{log.toLowerCase().includes("error") ? "!" : "ok"}</span>
                          {log}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {requestError && (
            <div className="tara-request-error" role="alert">
              <div>
                <strong>Tara could not finish that request.</strong>
                <span>{requestError}</span>
              </div>
              <div className="tara-error-actions">
                {lastFailedPrompt && <button type="button" onClick={() => void sendPrompt(lastFailedPrompt, false)} disabled={loading}>Retry request</button>}
                <button type="button" className="quiet" onClick={() => setRequestError(null)}>Dismiss</button>
              </div>
            </div>
          )}

          {loading && (
            <div className="tara-message-row agent" role="status" aria-label="Tara is processing">
              <div className="tara-message-meta">Tara</div>
              <div className="tara-message-bubble agent tara-processing">
                <span className="tara-spinner" aria-hidden="true" />
                Checking data and running the requested action...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <footer className="tara-composer-wrap">
          <form onSubmit={handleSubmit} className="tara-composer">
            <label htmlFor="tara-prompt" className="tara-sr-only">Ask Tara</label>
            <textarea
              id="tara-prompt"
              ref={composerRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_CHARS))}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask about clients, quotations, health, or an operation..."
              maxLength={MAX_PROMPT_CHARS}
              rows={1}
              disabled={loading}
              aria-describedby="tara-composer-help tara-composer-error"
            />
            <button type="submit" className="tara-send" disabled={loading || !!loadingChatId || !prompt.trim()}>
              {loading ? "Working..." : "Send"}
            </button>
          </form>
          <div className="tara-composer-meta" id="tara-composer-help">
            <span>Enter to send. Shift + Enter for a new line.</span>
            <span>{prompt.length}/{MAX_PROMPT_CHARS}</span>
          </div>
          <span id="tara-composer-error" className="tara-sr-only">{requestError || syncError || ""}</span>
        </footer>
      </main>
    </div>
  );
}
