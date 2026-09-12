"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import "../admin.css";

interface Message {
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return parsed
      .filter((session): session is Record<string, any> => !!session && typeof session === "object")
      .map((session) => {
        const messages: Message[] = Array.isArray(session.messages)
          ? session.messages
            .filter((message: any) => message && (message.role === "user" || message.role === "agent"))
            .map((message: any) => ({
              role: message.role,
              content: typeof message.content === "string" ? message.content : "",
              logs: Array.isArray(message.logs)
                ? message.logs.filter((log: unknown): log is string => typeof log === "string").slice(0, 50)
                : undefined,
            }))
            .filter((message: Message) => message.content.trim().length > 0)
          : [];
        const id = typeof session.id === "string" ? session.id : "";
        if (!id) return null;
        return {
          id,
          title: typeof session.title === "string" && session.title.trim()
            ? session.title.trim().slice(0, 200)
            : localTitle(messages),
          messages,
          updatedAt: Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now(),
        };
      })
      .filter((session): session is ChatSession => !!session);
  } catch {
    return [];
  }
}

function mapServerConversation(conversation: ServerConversation): ChatSession {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: [],
    updatedAt: Date.parse(conversation.updated_at) || Date.now(),
    legacyId: conversation.legacy_id || undefined,
  };
}

function mapServerMessages(rows: any[]): Message[] {
  return rows
    .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
    .map((row) => ({
      role: row.role === "assistant" ? "agent" as const : "user" as const,
      content: row.content,
      logs: Array.isArray(row.tool_logs)
        ? row.tool_logs.filter((log: unknown): log is string => typeof log === "string")
        : undefined,
    }));
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
  const [hydrated, setHydrated] = useState(false);
  const didLoadRef = useRef(false);
  const conversationLoadRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    const loadChats = async () => {
      const localSessions = parseLocalChats(localStorage.getItem(LOCAL_CHATS_KEY));
      const legacySessions = localSessions.filter((session) => !isServerConversationId(session.id));
      try {
        if (legacySessions.length > 0) {
          const importResponse = await fetch("/api/admin/agent", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "import", conversations: legacySessions }),
          });
          if (!importResponse.ok) throw new Error("Local chat migration failed.");
        }

        const response = await fetch("/api/admin/agent", { credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Tara conversations.");
        setChatSessions((data.conversations || []).map(mapServerConversation));
        setSyncError(null);
      } catch (error: any) {
        // Keep the old cache visible if the sync service is temporarily down;
        // all writes still target the server and will retry on the next load.
        setChatSessions(localSessions);
        setSyncError(error?.message || "Tara conversations could not be synchronized.");
      } finally {
        setHydrated(true);
      }
    };

    void loadChats();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(chatSessions));
    } catch {
      // Local storage is only a cache; server persistence remains authoritative.
    }
  }, [chatSessions, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewChat = () => {
    conversationLoadRef.current += 1;
    setMessages([]);
    setCurrentSessionId(null);
    setSyncError(null);
  };

  const selectChat = async (id: string) => {
    const session = chatSessions.find(c => c.id === id);
    if (!session) return;
    const loadId = conversationLoadRef.current + 1;
    conversationLoadRef.current = loadId;
    setCurrentSessionId(id);
    setLoadingChatId(id);
    setSyncError(null);
    try {
      if (!isServerConversationId(id)) {
        // This path is only used while showing a legacy cache during an outage.
        if (conversationLoadRef.current === loadId) setMessages(session.messages);
        return;
      }
      const response = await fetch(`/api/admin/agent?conversationId=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load that conversation.");
      if (conversationLoadRef.current === loadId) setMessages(mapServerMessages(data.messages || []));
    } catch (error: any) {
      if (conversationLoadRef.current === loadId) {
        setMessages(session.messages);
        setSyncError(error?.message || "That conversation could not be loaded.");
      }
    } finally {
      if (conversationLoadRef.current === loadId) setLoadingChatId(null);
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const previous = chatSessions;
    const wasCurrent = currentSessionId === id;
    if (wasCurrent) conversationLoadRef.current += 1;
    const updated = chatSessions.filter(c => c.id !== id);
    setChatSessions(updated);
    if (wasCurrent) {
      startNewChat();
    }
    if (!isServerConversationId(id)) return;
    try {
      const response = await fetch(`/api/admin/agent?conversationId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete that conversation.");
      setSyncError(null);
    } catch (error: any) {
      setChatSessions(previous);
      setSyncError(error?.message || "That conversation could not be deleted.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMessage = prompt.trim();
    const newMessagesForState = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessagesForState);
    
    setPrompt("");
    setLoading(true);

    try {
      const requestBody: Record<string, string> = { prompt: userMessage };
      if (isServerConversationId(currentSessionId)) requestBody.conversationId = currentSessionId;
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      
      if (res.ok) {
        const finalMessages = [
          ...newMessagesForState, 
          { role: "agent" as const, content: data.reply, logs: data.logs }
        ];
        setMessages(finalMessages);
        const serverId = typeof data.conversationId === "string" ? data.conversationId : currentSessionId;
        if (isServerConversationId(serverId)) {
          setCurrentSessionId(serverId);
          setChatSessions(prev => [{
            id: serverId,
            title: localTitle(finalMessages),
            messages: finalMessages,
            updatedAt: Date.now(),
          }, ...prev.filter((session) => session.id !== serverId)]);
        }
        setSyncError(null);
      } else {
        const errorMessages = [
          ...newMessagesForState, 
          { role: "agent" as const, content: `Error: ${data.error}` }
        ];
        setMessages(errorMessages);
        setSyncError(data.error || "Tara could not complete that request.");
      }
    } catch (err: any) {
      const errorMessages = [
        ...newMessagesForState, 
        { role: "agent" as const, content: `Failed to connect to agent: ${err.message}` }
      ];
      setMessages(errorMessages);
      setSyncError(err?.message || "Failed to connect to Tara.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-shell" style={{ display: "flex", height: "100vh", background: "var(--bg-light)" }}>
      
      {/* Sidebar for History */}
      <div style={{
        width: "280px",
        background: "white",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0
      }}>
        <div style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
          <button 
            onClick={startNewChat}
            className="btn-primary"
            style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "center", gap: "8px" }}
          >
            <span>+</span> New Chat
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-ghost)", marginBottom: "12px", paddingLeft: "8px" }}>Recent Chats</div>
          
          {chatSessions.length === 0 && (
            <div style={{ padding: "8px", fontSize: "13px", color: "var(--text-ghost)", textAlign: "center", marginTop: "20px" }}>No past chats</div>
          )}

          {chatSessions.map((session) => (
            <div 
              key={session.id}
              onClick={() => selectChat(session.id)}
              style={{
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: currentSessionId === session.id ? "var(--bg)" : "transparent",
                cursor: "pointer",
                marginBottom: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "background 0.2s",
                opacity: loadingChatId === session.id ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if(currentSessionId !== session.id) e.currentTarget.style.background = "var(--bg)"; }}
              onMouseLeave={(e) => { if(currentSessionId !== session.id) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ 
                fontSize: "14px", 
                fontWeight: currentSessionId === session.id ? 600 : 500,
                color: currentSessionId === session.id ? "var(--primary)" : "var(--text-dark)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1
              }}>
                {session.title}
              </div>
              <div 
                onClick={(e) => deleteChat(session.id, e)}
                style={{ fontSize: "12px", color: "var(--text-ghost)", padding: "4px", opacity: 0.7 }}
                title="Delete chat"
              >
                ✕
              </div>
            </div>
          ))}
        </div>
        
        <div style={{ padding: "20px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
           <button onClick={() => router.push("/admin")} className="btn-secondary" style={{ width: "100%", padding: "10px" }}>
             ← Exit to Dashboard
           </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <main className="admin-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        
        {/* Header */}
        <div className="admin-editor-header" style={{ padding: "20px 30px", borderBottom: "1px solid var(--border)", background: "white", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="admin-brand-icon" style={{ width: 38, height: 38, fontSize: 20 }}>✨</div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-dark)" }}>Tara - AI Client Manager</h2>
              <div style={{ fontSize: "12px", color: "var(--text-ghost)", fontWeight: 500 }}>Powered by Groq Agentic Automation</div>
            </div>
          </div>
          {syncError && (
            <div role="alert" style={{ marginTop: "12px", color: "var(--danger)", fontSize: "13px" }}>
              {syncError}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {messages.length === 0 && (
            <div className="admin-welcome" style={{ height: "100%", justifyContent: "center" }}>
              <div className="admin-welcome-icon" style={{ fontSize: 48, background: "transparent", boxShadow: "none", marginBottom: 10 }}>✨</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-dark)", marginBottom: 8 }}>Hi, I'm Tara!</h2>
              <p style={{ maxWidth: 500, margin: "0 auto", color: "var(--text-mid)", lineHeight: 1.6 }}>
                I'm your AI Assistant. I can help you create client accounts, configure them, delete test accounts, and send credential emails automatically. 
                <br/><br/>
                Try asking: <br/><strong>"Create a client account for ABC Windows, email abc@example.com with password Pass@123"</strong>
              </p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} style={{ 
              display: "flex", 
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start" 
            }}>
              <div style={{
                maxWidth: "75%",
                padding: "16px 22px",
                borderRadius: "var(--radius-lg)",
                background: msg.role === "user" ? "var(--primary)" : "white",
                color: msg.role === "user" ? "white" : "var(--text-dark)",
                boxShadow: msg.role === "user" ? "var(--shadow-primary)" : "var(--shadow-sm)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                borderBottomRightRadius: msg.role === "user" ? "4px" : "var(--radius-lg)",
                borderBottomLeftRadius: msg.role === "agent" ? "4px" : "var(--radius-lg)",
              }}>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: "15px" }}>{msg.content}</div>
                
                {msg.logs && msg.logs.length > 0 && (
                  <div style={{ 
                    marginTop: "16px", 
                    paddingTop: "12px", 
                    borderTop: `1px solid ${msg.role === "user" ? "rgba(255,255,255,0.2)" : "var(--border)"}` 
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", color: "var(--text-ghost)" }}>
                      Automated Actions
                    </div>
                    {msg.logs.map((log, i) => {
                      const isError = log.toLowerCase().includes("error");
                      return (
                        <div key={i} style={{ 
                          fontSize: "13px", 
                          background: isError ? "var(--danger)" : "var(--bg)", 
                          color: isError ? "white" : "var(--text-mid)",
                          padding: "8px 12px", 
                          borderRadius: "var(--radius-sm)",
                          marginBottom: "6px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontWeight: 500
                        }}>
                          <span>{isError ? "✕" : "✓"}</span>
                          <span>{log}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding: "16px 22px",
                borderRadius: "var(--radius-lg)",
                borderBottomLeftRadius: "4px",
                background: "white",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
                color: "var(--text-ghost)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "14px",
                fontWeight: 500
              }}>
                <div className="admin-loading" style={{ height: "auto", minHeight: "auto", display: "inline-block", background: "transparent", padding: 0 }}>Processing...</div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Area */}
        <div style={{ padding: "20px 30px", background: "white", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: "12px", maxWidth: "900px", margin: "0 auto" }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask Tara to create a client or manage accounts..."
              disabled={loading || !!loadingChatId}
              style={{
                flex: 1,
                padding: "16px 24px",
                borderRadius: "var(--radius-xl)",
                border: "1.5px solid var(--border)",
                background: "var(--bg)",
                fontSize: "15px",
                outline: "none",
                fontFamily: "inherit",
                color: "var(--text-dark)",
                transition: "all var(--transition-fast)"
              }}
              onFocus={(e) => {
                e.target.style.background = "white";
                e.target.style.borderColor = "var(--primary)";
                e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.background = "var(--bg)";
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow = "none";
              }}
            />
            <button 
              type="submit"
              disabled={loading || !!loadingChatId || !prompt.trim()}
              className="btn-primary"
              style={{ 
                borderRadius: "var(--radius-xl)", 
                padding: "0 28px",
                fontSize: "15px",
                opacity: (loading || !!loadingChatId || !prompt.trim()) ? 0.6 : 1,
                cursor: (loading || !!loadingChatId || !prompt.trim()) ? "not-allowed" : "pointer"
              }}
            >
              Send
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
