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
}

export default function AgentPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const endRef = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("tara_chats");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChatSessions(parsed);
      } catch (e) {}
    }
  }, []);

  // Save to localStorage when chatSessions change
  useEffect(() => {
    localStorage.setItem("tara_chats", JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
  };

  const selectChat = (id: string) => {
    const session = chatSessions.find(c => c.id === id);
    if (session) {
      setMessages(session.messages);
      setCurrentSessionId(id);
    }
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = chatSessions.filter(c => c.id !== id);
    setChatSessions(updated);
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const updateSession = (newMessages: Message[]) => {
    let id = currentSessionId;
    let title = "New Chat";
    
    // Auto-generate a title based on the first user message
    const firstUserMsg = newMessages.find(m => m.role === "user");
    if (firstUserMsg) {
      title = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
    }

    if (!id) {
      id = Date.now().toString();
      setCurrentSessionId(id);
      setChatSessions(prev => [{ id: id!, title, messages: newMessages, updatedAt: Date.now() }, ...prev]);
    } else {
      setChatSessions(prev => prev.map(s => s.id === id ? { ...s, title, messages: newMessages, updatedAt: Date.now() } : s));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMessage = prompt.trim();
    const newMessagesForState = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessagesForState);
    updateSession(newMessagesForState);
    
    setPrompt("");
    setLoading(true);

    try {
      const history = newMessagesForState.map(m => ({ 
        role: m.role === "agent" ? "assistant" : m.role, 
        content: m.content 
      }));
      
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage, history }),
      });
      const data = await res.json();
      
      if (res.ok) {
        const finalMessages = [
          ...newMessagesForState, 
          { role: "agent" as const, content: data.reply, logs: data.logs }
        ];
        setMessages(finalMessages);
        updateSession(finalMessages);
      } else {
        const errorMessages = [
          ...newMessagesForState, 
          { role: "agent" as const, content: `Error: ${data.error}` }
        ];
        setMessages(errorMessages);
        updateSession(errorMessages);
      }
    } catch (err: any) {
      const errorMessages = [
        ...newMessagesForState, 
        { role: "agent" as const, content: `Failed to connect to agent: ${err.message}` }
      ];
      setMessages(errorMessages);
      updateSession(errorMessages);
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
                transition: "background 0.2s"
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
              disabled={loading}
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
              disabled={loading || !prompt.trim()}
              className="btn-primary"
              style={{ 
                borderRadius: "var(--radius-xl)", 
                padding: "0 28px",
                fontSize: "15px",
                opacity: (loading || !prompt.trim()) ? 0.6 : 1,
                cursor: (loading || !prompt.trim()) ? "not-allowed" : "pointer"
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
