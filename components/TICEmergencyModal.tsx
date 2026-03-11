"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp | null;
  imageUrl?: string;
  isAdmin: boolean;
}

interface TICEmergencyModalProps {
  onClose: () => void;
  truckCodename?: string;
  personnelName?: string;
  emergencyReportId?: string;
  location?: { lat: number; lng: number; label?: string };
  description?: string;
  imageUrl?: string;
}

export default function TICEmergencyModal({
  onClose,
  truckCodename = "TIC",
  personnelName = "Field Personnel",
  emergencyReportId,
  location,
  description,
  imageUrl,
}: TICEmergencyModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real-time listener for messages
  useEffect(() => {
    if (!emergencyReportId) return;

    const messagesRef = collection(db, "EmergencyReports", emergencyReportId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Message, "id">),
      }));
      setMessages(loadedMessages);
    });

    return () => unsubscribe();
  }, [emergencyReportId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !emergencyReportId || !user) return;

    setSending(true);
    try {
      const messagesRef = collection(db, "EmergencyReports", emergencyReportId, "messages");
      await addDoc(messagesRef, {
        senderId: user.uid,
        senderName: user.displayName || user.email || "Admin",
        text: inputMessage.trim(),
        timestamp: Timestamp.now(),
        imageUrl: "",
        isAdmin: true,
      });

      setInputMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    return timestamp.toDate().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Emergency Header */}
        <div className="bg-gradient-to-r from-rose-600 to-red-700 px-6 py-5 border-b-4 border-red-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm animate-pulse">
                <span className="material-symbols-outlined text-white text-3xl font-bold">
                  emergency
                </span>
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 animate-ping"></span>
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400"></span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-3 py-1 bg-rose-900 text-white text-xs font-black uppercase tracking-wider rounded-full border-2 border-white/30">
                    TIC Emergency
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                    <span className="h-2 w-2 rounded-full bg-red-300 animate-pulse"></span>
                    ACTIVE
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Emergency Communication
                </h2>
                <p className="text-sm text-red-100 font-semibold mt-0.5">
                  {truckCodename} • {personnelName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all duration-200 hover:rotate-90"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>
        </div>

        {/* Alert Banner */}
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border-b-2 border-red-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 text-2xl mt-0.5 animate-bounce">
              warning
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-black text-red-900 uppercase tracking-wide mb-1">
                Critical Situation Alert
              </h3>
              <p className="text-sm text-red-700 font-semibold leading-relaxed">
                Vehicle <span className="font-black">{truckCodename}</span> has reported an emergency in the field.
                Personnel requires immediate assistance. Maintain continuous communication.
              </p>
            </div>
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="h-96 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100 p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="material-symbols-outlined text-slate-300 text-5xl mb-3">chat</span>
                <p className="text-slate-400 font-medium">No messages yet</p>
                <p className="text-xs text-slate-400 mt-1">Start the conversation below</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.isAdmin ? "justify-end" : "justify-start"} animate-slide-up`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-md ${
                    msg.isAdmin
                      ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                      : "bg-white text-slate-900 border-2 border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-sm">
                      {msg.isAdmin ? "admin_panel_settings" : "shield_person"}
                    </span>
                    <span className="text-xs font-bold opacity-90">
                      {msg.senderName}
                    </span>
                  </div>
                  {msg.imageUrl && (
                    <img 
                      src={msg.imageUrl} 
                      alt="Attachment" 
                      className="w-full rounded-lg mb-2 max-h-48 object-cover"
                    />
                  )}
                  <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                  <p className={`text-xs font-semibold mt-2 ${msg.isAdmin ? "text-blue-100" : "text-slate-500"}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="border-t-2 border-slate-200 bg-white p-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                chat
              </span>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message to personnel..."
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-12 pr-4 py-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!inputMessage.trim() || sending}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {sending ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  Sending...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">send</span>
                  Send
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3 px-2">
            <span className="material-symbols-outlined text-slate-400 text-sm">info</span>
            <p className="text-xs text-slate-500 font-medium">
              All communications are encrypted and logged for security purposes.
            </p>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
