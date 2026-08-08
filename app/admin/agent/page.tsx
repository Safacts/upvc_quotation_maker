"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function AgentPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "agent", content: string, logs?: string[] }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMessage = prompt.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setPrompt("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessages((prev) => [
          ...prev, 
          { role: "agent", content: data.reply, logs: data.logs }
        ]);
      } else {
        setMessages((prev) => [
          ...prev, 
          { role: "agent", content: `Error: ${data.error}` }
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev, 
        { role: "agent", content: `Failed to connect to agent: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center shadow-md z-10">
          <button 
            onClick={() => router.push("/admin")}
            className="mr-4 p-2 hover:bg-slate-800 rounded-full transition-colors"
            title="Back to Admin"
          >
            <ArrowLeft size={20} />
          </button>
          <Bot size={28} className="text-emerald-400 mr-3" />
          <div>
            <h1 className="font-bold text-lg">AI Client Manager</h1>
            <p className="text-xs text-slate-300">Powered by Groq Agentic Automation</p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <Bot size={64} className="opacity-20" />
              <p className="text-center max-w-md">
                I can help you create client accounts, configure them, and send credential emails automatically. 
                <br/><br/>
                Try asking: <strong>"Create a client account for ABC Windows, email abc@example.com with password Pass@123"</strong>
              </p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${msg.role === "user" ? "bg-emerald-600 text-white rounded-br-none" : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"}`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                
                {msg.logs && msg.logs.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Automated Actions</p>
                    {msg.logs.map((log, i) => (
                      <div key={i} className="flex items-start text-sm bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg">
                        {log.toLowerCase().includes("error") ? (
                          <AlertCircle size={16} className="mr-2 text-red-500 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 size={16} className="mr-2 text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        <span className={log.toLowerCase().includes("error") ? "text-red-700 font-medium" : ""}>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 flex items-center space-x-3 text-slate-500 shadow-sm">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Agent is thinking and running tools...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask me to create a client or send an email..."
              className="w-full bg-slate-100 text-slate-900 rounded-full pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              disabled={loading}
            />
            <button 
              type="submit"
              disabled={loading || !prompt.trim()}
              className="absolute right-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white p-2.5 rounded-full transition-colors flex items-center justify-center"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
