"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  toolsUsed: { connector: string; tool: string }[] | null;
  createdAt: string;
}

export default function GeneralChatPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat sessions
  const loadSessions = async (selectFirst = false) => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (selectFirst && data.sessions?.length > 0) {
          setActiveSessionId(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions(true);
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setMessagesLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/chat/sessions/${activeSessionId}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        } else {
          setError("Failed to load conversation history.");
        }
      } catch {
        setError("Network error loading history.");
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
  }, [activeSessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Create new session
  const handleNewSession = async () => {
    setError("");
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
      } else {
        setError("Failed to create new chat session.");
      }
    } catch {
      setError("Network error creating session.");
    }
  };

  // Delete session
  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat session? All messages will be permanently lost.")) return;
    
    setError("");
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeSessionId === id) {
          setActiveSessionId(null);
        }
      } else {
        setError("Failed to delete session.");
      }
    } catch {
      setError("Network error deleting session.");
    }
  };

  // Send message
  const handleSend = async (textToSend = input) => {
    const trimmed = textToSend.trim();
    if (!trimmed || !activeSessionId || sending) return;

    setInput("");
    setSending(true);
    setError("");

    // Optimistic user message update
    const tempUserMsg: ChatMessage = {
      id: "temp-user",
      role: "user",
      content: trimmed,
      provider: null,
      toolsUsed: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: historyPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Remove temp message and append actual messages returned from API
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== "temp-user"),
          ...(data.messages || []),
        ]);
        // Reload sessions list to update the title in sidebar if it changed
        loadSessions();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to get AI response.");
        setMessages((prev) => prev.filter((m) => m.id !== "temp-user"));
      }
    } catch {
      setError("Network error sending message.");
      setMessages((prev) => prev.filter((m) => m.id !== "temp-user"));
    } finally {
      setSending(false);
    }
  };

  const suggestedPrompts = [
    { text: "Launch a scan on portinel.haydarkadioglu.com", title: "Scan target" },
    { text: "Show my 10 most recent scans", title: "List scans" },
    { text: "What tools and MCP connectors do you have access to?", title: "Assess capabilities" },
  ];

  return (
    <div className="flex h-[calc(100vh-4.5rem)] overflow-hidden rounded-xl border border-line bg-surface/40 backdrop-blur-md">
      {/* Sessions Sidebar */}
      <div className="flex w-64 flex-col border-r border-line bg-surface-2/60">
        <div className="p-3 border-b border-line">
          <button
            onClick={handleNewSession}
            className="btn btn-primary w-full flex items-center justify-center gap-2 !py-2 text-xs"
          >
            <span>+</span> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-4 w-4" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">No chats yet</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={cn(
                  "group relative w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition flex justify-between items-center",
                  activeSessionId === s.id
                    ? "bg-brand/10 text-brand"
                    : "text-muted hover:bg-white/[0.04] hover:text-ink"
                )}
              >
                <span className="truncate pr-4 font-medium">{s.title}</span>
                <span
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-danger rounded transition hover:bg-white/[0.08]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                  </svg>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-base/20">
        {error && (
          <div className="bg-danger/10 border-b border-danger/25 text-danger px-4 py-2 text-xs flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError("")} className="hover:text-ink font-bold">×</button>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSessionId ? (
            <div className="h-full flex flex-col justify-center items-center max-w-lg mx-auto text-center space-y-6">
              <div className="text-4xl">🤖</div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight">Portinel AI Assistant</h2>
                <p className="text-sm text-muted">
                  Talk to the autonomous security agent. You can ask me to run reconnaissance scans, review results, or invoke external tools from connected MCP servers.
                </p>
              </div>

              {sessions.length > 0 ? (
                <p className="text-xs text-muted">Select a chat from the sidebar or click &quot;New Chat&quot; to begin.</p>
              ) : (
                <button onClick={handleNewSession} className="btn btn-primary !py-2 text-xs">
                  Create First Chat
                </button>
              )}
            </div>
          ) : messages.length === 0 && !messagesLoading ? (
            <div className="h-full flex flex-col justify-center items-center max-w-lg mx-auto text-center space-y-6">
              <div className="text-3xl">🧭</div>
              <div className="space-y-1">
                <h3 className="font-semibold text-base">Ask Portinel AI</h3>
                <p className="text-xs text-muted">Choose a prompt below or type your own question to start the conversation.</p>
              </div>

              <div className="grid gap-3 w-full">
                {suggestedPrompts.map((p) => (
                  <button
                    key={p.text}
                    onClick={() => handleSend(p.text)}
                    className="text-left rounded-xl border border-line bg-white/[0.02] p-3 text-xs transition hover:border-brand/40 hover:bg-brand/5 group flex justify-between items-center cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-ink group-hover:text-brand transition">{p.title}</div>
                      <div className="text-muted mt-0.5">{p.text}</div>
                    </div>
                    <span className="text-muted group-hover:text-brand font-semibold">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : messagesLoading ? (
            <div className="h-full flex justify-center items-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex w-full flex-col max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed transition",
                      isUser
                        ? "ml-auto bg-gradient-to-r from-brand/20 to-accent/15 border border-brand/20 text-ink rounded-tr-none"
                        : "mr-auto bg-surface-2 border border-line text-muted rounded-tl-none"
                    )}
                  >
                    <div className="flex justify-between items-center mb-1 text-[10px] text-muted opacity-80">
                      <span className="font-semibold capitalize">{m.role}</span>
                      {m.provider && <span>via {m.provider}</span>}
                    </div>

                    <div className="whitespace-pre-wrap font-sans text-ink leading-relaxed break-words">{m.content}</div>

                    {!isUser && m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-line flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-muted">Tools invoked:</span>
                        {m.toolsUsed.map((t, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-brand border border-line"
                          >
                            🔧 {t.connector !== "__agent__" ? `${t.connector}::` : ""}{t.tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {sending && (
                <div className="mr-auto bg-surface-2 border border-line rounded-2xl rounded-tl-none p-4 max-w-[80%] flex items-center gap-3">
                  <Spinner className="h-3.5 w-3.5" />
                  <span className="text-xs text-muted font-mono animate-pulse">AI agent is thinking and executing tools...</span>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {activeSessionId && (
          <div className="p-3 border-t border-line bg-surface-2/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Portinel AI to scan, analyze, or run commands..."
                disabled={sending}
                className="input flex-1 !text-xs !py-2.5"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="btn btn-primary !py-2.5 !px-4 text-xs font-semibold"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
