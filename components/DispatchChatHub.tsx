"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type ChatMessage = {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp | null;
  isAdmin?: boolean;
};

type DispatchChatThread = {
  id: string;
  dispatchId?: string;
  personnels?: string;
  truck?: string;
  status?: string;
  dispatchChat?: ChatMessage[];
  createdAt?: Timestamp | null;
  lastChatAt?: Timestamp | null;
};

const STORAGE_KEYS = {
  activeDispatchId: "dispatch_chat_active_dispatch_id",
} as const;

function sortMessages(messages: ChatMessage[] = []): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const aMs = a.timestamp?.toMillis?.() ?? 0;
    const bMs = b.timestamp?.toMillis?.() ?? 0;
    return aMs - bMs;
  });
}

export default function DispatchChatHub() {
  const pathname = usePathname();
  const { user } = useAuth();

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(null);
  const [threads, setThreads] = useState<DispatchChatThread[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [restoredState, setRestoredState] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number }>({ top: 72, left: 16 });

  const hideOnRoutes = pathname === "/login" || pathname === "/setup-admin";

  useEffect(() => {
    if (!user || hideOnRoutes) return;

    const q = query(collection(db, "dispatches"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DispatchChatThread, "id">) }));
      setThreads(loaded);
      setThreadsLoaded(true);
    });

    return () => unsubscribe();
  }, [user, hideOnRoutes]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || restoredState) return;

    const savedActiveDispatchId = window.sessionStorage.getItem(STORAGE_KEYS.activeDispatchId);

    if (savedActiveDispatchId) {
      setActiveDispatchId(savedActiveDispatchId);
    }

    setRestoredState(true);
  }, [isMounted, restoredState]);

  useEffect(() => {
    if (!isMounted || !restoredState) return;

    if (activeDispatchId) {
      window.sessionStorage.setItem(STORAGE_KEYS.activeDispatchId, activeDispatchId);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEYS.activeDispatchId);
    }
  }, [activeDispatchId, isMounted, restoredState]);

  useEffect(() => {
    const handleOpenChat = (event: Event) => {
      const customEvent = event as CustomEvent<{ dispatchId?: string }>;
      const incomingDispatchId = customEvent.detail?.dispatchId;
      if (!incomingDispatchId) return;
      setPanelOpen(true);
      setActiveDispatchId(incomingDispatchId);
    };

    window.addEventListener("open-dispatch-chat", handleOpenChat as EventListener);
    return () => window.removeEventListener("open-dispatch-chat", handleOpenChat as EventListener);
  }, []);

  useEffect(() => {
    if (!activeDispatchId) return;
    if (!threadsLoaded) return;
    const exists = threads.some((thread) => thread.id === activeDispatchId);
    if (!exists) {
      setActiveDispatchId(null);
    }
  }, [threads, activeDispatchId, threadsLoaded]);

  useEffect(() => {
    const updatePanelPosition = () => {
      if (!triggerRef.current) return;

      const panelWidth = 320;
      const viewportPadding = 12;
      const rect = triggerRef.current.getBoundingClientRect();

      // Align right edge with trigger right edge and keep panel inside viewport.
      const preferredLeft = rect.right - panelWidth;
      const minLeft = viewportPadding;
      const maxLeft = window.innerWidth - panelWidth - viewportPadding;
      const clampedLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

      setPanelPosition({
        top: rect.bottom + 10,
        left: clampedLeft,
      });
    };

    updatePanelPosition();

    if (panelOpen) {
      window.addEventListener("resize", updatePanelPosition);
      window.addEventListener("scroll", updatePanelPosition, true);
    }

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [panelOpen]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeDispatchId) ?? null,
    [threads, activeDispatchId]
  );

  const activeMessages = useMemo(() => sortMessages(activeThread?.dispatchChat ?? []), [activeThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread?.id || !user || !messageInput.trim()) return;

    setSending(true);
    try {
      const chatMessage: ChatMessage = {
        senderId: user.uid,
        senderName: user.displayName || user.email || "Admin",
        text: messageInput.trim(),
        timestamp: Timestamp.now(),
        isAdmin: true,
      };

      await updateDoc(doc(db, "dispatches", activeThread.id), {
        dispatchChat: arrayUnion(chatMessage),
        lastChatAt: Timestamp.now(),
      });

      setMessageInput("");
    } catch (error: any) {
      console.error("Error sending dispatch chat:", error);
      alert(`Failed to send chat message: ${error?.message || "Unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  if (!user || hideOnRoutes) return null;

  const overlays = isMounted
    ? createPortal(
        <>
          {panelOpen && (
            <div
              className="fixed z-[2147483640] w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
              style={{ top: panelPosition.top, left: panelPosition.left }}
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-800">Dispatch Chats</h3>
                <button onClick={() => setPanelOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700">
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {threads.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">No dispatches available.</p>
                ) : (
                  threads.map((thread) => {
                    const lastMessage = sortMessages(thread.dispatchChat ?? []).slice(-1)[0];
                    const isActive = thread.id === activeDispatchId;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => setActiveDispatchId(thread.id)}
                        className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${isActive ? "bg-blue-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{thread.personnels || "Personnel"}</p>
                          <span className="text-[10px] text-slate-500 font-mono">{thread.dispatchId || thread.id.slice(0, 8)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 truncate">{lastMessage?.text || "No messages yet"}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeThread && (
            <div className="fixed bottom-4 right-6 z-[2147483641] w-[360px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
                <div>
                  <p className="text-sm font-bold">{activeThread.personnels || "Personnel"}</p>
                  <p className="text-[10px] text-slate-300 font-mono">{activeThread.dispatchId || activeThread.id}</p>
                </div>
                <button onClick={() => setActiveDispatchId(null)} className="rounded p-1 hover:bg-white/10">
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                </button>
              </div>

              <div className="h-72 overflow-y-auto bg-slate-50 p-3 space-y-2">
                {activeMessages.length === 0 ? (
                  <p className="pt-20 text-center text-sm text-slate-500">No chat messages yet.</p>
                ) : (
                  activeMessages.map((message, idx) => {
                    const isMine = message.senderId === user.uid;
                    return (
                      <div key={`${message.senderId}-${idx}-${message.timestamp?.toMillis?.() ?? idx}`} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isMine ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                          <p className={`text-[10px] font-bold ${isMine ? "text-blue-100" : "text-slate-500"}`}>{message.senderName}</p>
                          <p className="break-words">{message.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
                <input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={500}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={sending || !messageInput.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending" : "Send"}
                </button>
              </form>
            </div>
          )}
        </>,
        document.body
      )
    : null;

  return (
    <>
      <div className="relative z-30">
        <button
          ref={triggerRef}
          onClick={() => setPanelOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chat</span>
          Dispatch Chat
        </button>
      </div>
      {overlays}
    </>
  );
}
