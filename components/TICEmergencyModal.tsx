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
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import AppDialog from "@/components/AppDialog";
import { acquireModalLock, releaseModalLock } from "@/lib/modal-lock";

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
  dispatchId?: string;
  location?: { lat: number; lng: number; label?: string };
  description?: string;
  imageUrl?: string;
  onResolved?: () => void;
  isResolved?: boolean;
}

export default function TICEmergencyModal({
  onClose,
  truckCodename = "TIC",
  personnelName = "Field Personnel",
  emergencyReportId,
  dispatchId,
  location,
  description,
  imageUrl,
  isResolved = false,
}: TICEmergencyModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [roleChecked, setRoleChecked] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [resultDialog, setResultDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    tone: "default" | "success" | "danger";
    closeParentOnConfirm?: boolean;
  }>({
    open: false,
    title: "",
    message: "",
    tone: "default",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    acquireModalLock();
    return () => {
      releaseModalLock();
    };
  }, []);

  // Debug: Log IDs when component mounts or props change
  useEffect(() => {
    console.log("ðŸ” Modal opened with:", {
      emergencyReportId,
      dispatchId,
      willUseCollection: dispatchId ? "dispatches" : "EmergencyReports",
      willUseChatId: dispatchId || emergencyReportId
    });
  }, [emergencyReportId, dispatchId]);

  // Detect if current user is admin (users collection) or personnel (personnelAccount collection)
  useEffect(() => {
    const checkUserRole = async () => {
      if (!user) return;

      try {
        console.log("ðŸ” Checking user role for:", user.uid);
        
        // Check if user exists in "users" collection (admin)
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setIsAdmin(true);
          setUserDisplayName(user.displayName || user.email || "Admin");
          setRoleChecked(true);
          console.log("âœ… User is ADMIN:", user.displayName || user.email);
          return;
        }

        // Check if user exists in "personnelAccount" collection (personnel)
        const personnelDoc = await getDoc(doc(db, "personnelAccount", user.uid));
        if (personnelDoc.exists()) {
          setIsAdmin(false);
          const data = personnelDoc.data();
          setUserDisplayName(data?.fullName || data?.name || "Personnel");
          setRoleChecked(true);
          console.log("âœ… User is PERSONNEL:", data?.fullName || data?.name);
          return;
        }

        // Fallback
        setIsAdmin(false);
        setUserDisplayName(user.displayName || user.email || "User");
        setRoleChecked(true);
        console.warn("âš ï¸ User not found in users or personnelAccount collections");
      } catch (error) {
        console.error("âŒ Error checking user role:", error);
        setIsAdmin(false);
        setUserDisplayName(user.displayName || user.email || "User");
        setRoleChecked(true);
      }
    };

    checkUserRole();
  }, [user]);

  // Real-time listener for messages
  useEffect(() => {
    if (!emergencyReportId && !dispatchId) {
      console.warn("âš ï¸ No dispatchId or emergencyReportId provided");
      return;
    }

    const unsubscribers: Array<() => void> = [];
    let emergencyMessages: Message[] = [];
    let dispatchMessages: Message[] = [];

    const mergeAndSetMessages = () => {
      const merged = [...emergencyMessages, ...dispatchMessages];
      const dedupedMap = new Map<string, Message>();

      merged.forEach((msg) => {
        const key = `${msg.senderId}|${msg.text}|${msg.timestamp?.toMillis?.() ?? 0}|${msg.isAdmin ? "1" : "0"}`;
        if (!dedupedMap.has(key)) {
          dedupedMap.set(key, msg);
        }
      });

      const deduped = Array.from(dedupedMap.values()).sort((a, b) => {
        const aTime = a.timestamp?.toMillis?.() ?? 0;
        const bTime = b.timestamp?.toMillis?.() ?? 0;
        return aTime - bTime;
      });

      setMessages(deduped);
      console.log("ðŸ“¨ Loaded merged messages:", deduped.length);
    };

    if (emergencyReportId) {
      console.log(`ðŸ“¡ Listening to emergency thread: EmergencyReports/${emergencyReportId}/messages`);
      const emergencyMessagesRef = collection(db, "EmergencyReports", emergencyReportId, "messages");
      const emergencyQ = query(emergencyMessagesRef, orderBy("timestamp", "asc"));

      unsubscribers.push(
        onSnapshot(
          emergencyQ,
          (snapshot) => {
            emergencyMessages = snapshot.docs.map((chatDoc) => ({
              id: `er-${chatDoc.id}`,
              ...(chatDoc.data() as Omit<Message, "id">),
            }));
            mergeAndSetMessages();
          },
          (error) => {
            console.error("âŒ Error listening to emergency messages:", error);
          }
        )
      );
    }

    // Bridge dispatch support chat too so admin and personnel always interact on same thread.
    if (dispatchId) {
      console.log(`ðŸ“¡ Listening to dispatch thread: dispatches/${dispatchId}/messages`);
      const dispatchMessagesRef = collection(db, "dispatches", dispatchId, "messages");
      const dispatchQ = query(dispatchMessagesRef, orderBy("timestamp", "asc"));

      unsubscribers.push(
        onSnapshot(
          dispatchQ,
          (snapshot) => {
            dispatchMessages = snapshot.docs.map((chatDoc) => ({
              id: `dp-${chatDoc.id}`,
              ...(chatDoc.data() as Omit<Message, "id">),
            }));
            mergeAndSetMessages();
          },
          (error) => {
            console.error("âŒ Error listening to dispatch messages:", error);
          }
        )
      );
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [emergencyReportId, dispatchId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || (!emergencyReportId && !dispatchId) || !user) {
      console.warn("âš ï¸ Cannot send - missing data:", {
        hasMessage: !!inputMessage.trim(),
        hasDispatchId: !!dispatchId,
        hasReportId: !!emergencyReportId,
        hasUser: !!user,
      });
      return;
    }

    if (!roleChecked) {
      console.warn("âš ï¸ Role not yet checked, please wait...");
      alert("Please wait, checking your permissions...");
      return;
    }

    setSending(true);
    try {
      const messageData = {
        senderId: user.uid,
        senderName: userDisplayName || "Unknown",
        text: inputMessage.trim(),
        timestamp: Timestamp.now(),
        imageUrl: "",
        isAdmin: isAdmin,
      };
      
      console.log("ðŸ“¦ Message data:", messageData);

      const writes: Promise<any>[] = [];

      // Primary emergency thread
      if (emergencyReportId) {
        const emergencyMessagesRef = collection(db, "EmergencyReports", emergencyReportId, "messages");
        writes.push(addDoc(emergencyMessagesRef, messageData));
      }

      // Bridge dispatch support chat thread so mobile/web stay in sync
      if (dispatchId) {
        const dispatchMessagesRef = collection(db, "dispatches", dispatchId, "messages");
        writes.push(addDoc(dispatchMessagesRef, messageData));
      }

      await Promise.all(writes);

      console.log("âœ… Message sent successfully");
      setInputMessage("");
    } catch (error: any) {
      console.error("âŒ Error sending message:", error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
      alert(`Failed to send message: ${error?.message || "Unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  const handleResolveEmergency = async () => {
    if (!emergencyReportId) {
      console.error("âŒ No emergency report ID provided:", { emergencyReportId, dispatchId });
      setResultDialog({
        open: true,
        title: "Unable to Resolve",
        message: "Cannot resolve because the emergency report ID is missing. Please close and try again.",
        tone: "danger",
      });
      return;
    }

    // Validate the ID is a string and not empty
    if (typeof emergencyReportId !== 'string' || emergencyReportId.trim() === '') {
      console.error("âŒ Invalid emergency report ID:", emergencyReportId);
      setResultDialog({
        open: true,
        title: "Unable to Resolve",
        message: "Cannot resolve because the emergency report ID is invalid.",
        tone: "danger",
      });
      return;
    }

    setResolving(true);
    try {
      console.log("âœ… Resolving emergency report:", emergencyReportId);
      console.log("ðŸ“ Document path:", `EmergencyReports/${emergencyReportId}`);
      
      const reportRef = doc(db, "EmergencyReports", emergencyReportId);
      await updateDoc(reportRef, {
        status: "resolved",
        resolvedAt: Timestamp.now(),
        resolvedBy: user?.uid,
      });

      console.log("âœ… Emergency resolved successfully");
      setResultDialog({
        open: true,
        title: "Emergency Resolved",
        message: "Emergency marked as RESOLVED successfully!",
        tone: "success",
        closeParentOnConfirm: true,
      });
    } catch (error: any) {
      console.error("âŒ Error resolving emergency:", error);
      console.error("âŒ Error code:", error?.code);
      console.error("âŒ Report ID was:", emergencyReportId);
      setResultDialog({
        open: true,
        title: "Resolve Failed",
        message: `Failed to resolve emergency: ${error?.message || "Unknown error"}`,
        tone: "danger",
      });
    } finally {
      setResolving(false);
    }
  };

  const handleResolveButtonClick = () => {
    setShowResolveConfirm(true);
  };

  const handleCloseResultDialog = () => {
    const shouldCloseParent = resultDialog.closeParentOnConfirm;
    setResultDialog({
      open: false,
      title: "",
      message: "",
      tone: "default",
      closeParentOnConfirm: false,
    });

    if (shouldCloseParent) {
      onClose();
    }
  };

  const formatTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    return timestamp.toDate().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const emergencyInfoText = [
    `EMERGENCY REPORTED: ${truckCodename}`,
    location ? `Location: ${location.label || "Unknown"} (${location.lat}, ${location.lng})` : "",
    description ? `Description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const hasEmergencyContext = Boolean(location || description || imageUrl);

  const emergencyInfoMessage: Message | null = hasEmergencyContext
    ? {
        id: `emergency-info-${emergencyReportId || dispatchId || "local"}`,
        senderId: "system-emergency",
        senderName: "Emergency System",
        text: emergencyInfoText,
        timestamp: null,
        imageUrl: imageUrl || "",
        isAdmin: false,
      }
    : null;

  const displayMessages = emergencyInfoMessage ? [emergencyInfoMessage, ...messages] : messages;

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
                  {isResolved ? (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-500/40 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-green-300/50">
                      <span className="h-2 w-2 rounded-full bg-green-300"></span>
                      RESOLVED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                      <span className="h-2 w-2 rounded-full bg-red-300 animate-pulse"></span>
                      ACTIVE
                    </span>
                  )}
                  {dispatchId && (
                    <span className="px-2 py-1 bg-blue-500/30 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                      Dispatch Chat
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Emergency Communication
                </h2>
                <p className="text-sm text-red-100 font-semibold mt-0.5">
                  {truckCodename} - {personnelName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isResolved ? (
                <span className="flex items-center gap-2 px-4 py-2 bg-green-500/30 border border-green-300/60 text-white font-bold rounded-xl">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  Resolved
                </span>
              ) : (
                emergencyReportId && (
                  <button
                    onClick={() => {
                      console.log("ðŸ”˜ Modal Resolve button clicked. Report ID:", emergencyReportId, "Type:", typeof emergencyReportId);
                      handleResolveButtonClick();
                    }}
                    disabled={resolving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    {resolving ? "Resolving..." : "Resolve"}
                  </button>
                )
              )}
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all duration-200 hover:rotate-90"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alert Banner */}
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border-b-2 border-red-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 text-2xl mt-0.5 animate-bounce">
              warning
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-black text-red-900 uppercase tracking-wide">
                  Critical Situation Alert
                </h3>
                {/* User Role Indicator */}
                {roleChecked ? (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    isAdmin 
                      ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                      : 'bg-green-100 text-green-700 border border-green-300'
                  }`}>
                    {isAdmin ? 'Admin' : 'Personnel'} - {userDisplayName}
                  </span>
                ) : (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300 animate-pulse">
                    Checking permissions...
                  </span>
                )}
              </div>
              <p className="text-sm text-red-700 font-semibold leading-relaxed">
                Vehicle <span className="font-black">{truckCodename}</span> has reported an emergency in the field.
                Personnel requires immediate assistance. Maintain continuous communication.
              </p>
            </div>
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="h-96 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100 p-6 space-y-4 custom-scrollbar">
          {displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="material-symbols-outlined text-slate-300 text-5xl mb-3">chat</span>
                <p className="text-slate-400 font-medium">No messages yet</p>
                <p className="text-xs text-slate-400 mt-1">Start the conversation below</p>
              </div>
            </div>
          ) : (
            displayMessages.map((msg) => (
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
              disabled={!inputMessage.trim() || sending || !roleChecked}
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
          <div className="flex items-center justify-between gap-2 mt-3 px-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-sm">info</span>
              <p className="text-xs text-slate-500 font-medium">
                All communications are encrypted and logged for security purposes.
              </p>
            </div>
            {/* Debug Info */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${messages.length >= 0 ? 'bg-green-500' : 'bg-gray-400'} animate-pulse`}></span>
              <span className="text-slate-400 font-mono">
                {messages.length} msg - {dispatchId ? `Dispatch: ${dispatchId.slice(-6)}` : `Report: ${emergencyReportId?.slice(-6)}`}
              </span>
            </div>
          </div>
        </form>
      </div>

      <AppDialog
        open={showResolveConfirm}
        title="Confirm Resolution"
        message="Are you sure you want to mark this emergency as RESOLVED? This will close the emergency report."
        tone="danger"
        confirmText={resolving ? "Resolving..." : "Yes, Resolve"}
        cancelText="Cancel"
        confirmDisabled={resolving}
        onCancel={() => setShowResolveConfirm(false)}
        onConfirm={async () => {
          setShowResolveConfirm(false);
          await handleResolveEmergency();
        }}
      />

      <AppDialog
        open={resultDialog.open}
        title={resultDialog.title}
        message={resultDialog.message}
        tone={resultDialog.tone}
        confirmText="OK"
        hideCancel
        onConfirm={handleCloseResultDialog}
      />

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
