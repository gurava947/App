import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, TouchEvent } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { BottomNav, Topbar } from "./components/Layout";
import { ChatsPage, NewMessageModal } from "./components/Chats";
import { CallOverlay, CallsPage, LoginPage, ReelsPage, SettingsPage, UpdatesPage } from "./components/Pages";
import { Icon } from "./components/Icon";
import { api, realtimeUrl } from "./services/api";
import { useCallSession } from "./hooks/useCallSession";
import { defaultChatTheme } from "./data/chatThemes";
import type { Chat, ChatTheme, MessageKind, MessagePayloadInput, Page, User } from "./types";

const userStorageKey = "inchat-local-user";
const presenceStatusStorageKey = (userId: string) => `inchat-show-presence-${userId}`;
type ActiveLocationShare = { id: string; contactId: string; contactName: string; senderId: string; expiresAt: string; watchId: number | null };

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  });
}

function locationError(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "number") {
    if (error.code === 1) return new Error("Allow location permission in your browser to share your location.");
    if (error.code === 2) return new Error("Your current location is unavailable.");
    if (error.code === 3) return new Error("The browser timed out while finding your location.");
  }
  return error instanceof Error ? error : new Error("Could not read your location.");
}

function storedUser(): User | null {
  const saved = localStorage.getItem(userStorageKey);
  if (!saved) return null;
  try {
    const user: unknown = JSON.parse(saved);
    if (user && typeof user === "object" && "id" in user && "email" in user && "name" in user && "createdAt" in user
      && typeof user.id === "string" && typeof user.email === "string" && typeof user.name === "string" && typeof user.createdAt === "string") {
      return user as User;
    }
    return null;
  } catch {
    localStorage.removeItem(userStorageKey);
    return null;
  }
}

function App() {
  const [user, setUser] = useState<User | null>(storedUser);
  const [page, setPage] = useState<Page>("Chats");
  const [showMore, setShowMore] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMessageSearch, setNewMessageSearch] = useState("");
  const [toast, setToast] = useState("");
  const [serverError, setServerError] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.bootstrap>> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [notificationsOn, setNotificationsOn] = useState(() => user ? localStorage.getItem(`inchat-notifications-${user.id}`) === "true" : false);
  const [darkMode, setDarkMode] = useState(() => user ? localStorage.getItem(`inchat-theme-${user.id}`) === "dark" : false);
  const [showPresenceStatus, setShowPresenceStatus] = useState(() => user ? localStorage.getItem(presenceStatusStorageKey(user.id)) !== "false" : true);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(() => new Set());
  const socketRef = useRef<Socket | null>(null);
  const typingExpiryTimersRef = useRef(new Map<string, number>());
  const pageSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [liveLocation, setLiveLocation] = useState<ActiveLocationShare | null>(null);
  const liveLocationRef = useRef<ActiveLocationShare | null>(null);
  const locationExpiryTimer = useRef<number | null>(null);
  const lastLocationUpdate = useRef(0);
  const setActiveLocation = useCallback((share: ActiveLocationShare | null) => {
    liveLocationRef.current = share;
    setLiveLocation(share);
  }, []);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const refresh = useCallback(async (accountId: string) => {
    const next = await api.bootstrap(accountId);
    setData(next);
    setSelectedId((current) => next.chats.some((chat) => chat.id === current) ? current : (next.chats[0]?.id ?? ""));
    setServerError("");
  }, []);
  const refreshCurrentUser = useCallback(() => {
    if (user) void refresh(user.id);
  }, [refresh, user]);
  const callSession = useCallSession(user, refreshCurrentUser, notify);
  const emitTyping = useCallback((recipientId: string, typing: boolean) => {
    socketRef.current?.emit("chat:typing", { recipientId, typing });
  }, []);

  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }

    let active = true;
    const load = () => {
      void api.bootstrap(user.id).then((next) => {
        if (!active) return;
        setData(next);
        const currentShare = liveLocationRef.current;
        if (currentShare && !next.locationShares.some((share) => share.id === currentShare.id)) {
          if (currentShare.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(currentShare.watchId);
          if (locationExpiryTimer.current !== null) window.clearTimeout(locationExpiryTimer.current);
          locationExpiryTimer.current = null;
          setActiveLocation(null);
        } else if (!currentShare) {
          const restored = next.locationShares.find((share) => share.senderId === user.id);
          if (restored) {
            const contactId = restored.recipientId;
            const contactName = next.chats.find((chat) => chat.id === contactId)?.name
              ?? next.directory.find((person) => person.id === contactId)?.name
              ?? "your connection";
            setActiveLocation({ id: restored.id, contactId, contactName, senderId: restored.senderId, expiresAt: restored.expiresAt, watchId: null });
            locationExpiryTimer.current = window.setTimeout(() => {
              if (liveLocationRef.current?.id === restored.id) setActiveLocation(null);
              locationExpiryTimer.current = null;
            }, Math.max(0, Date.parse(restored.expiresAt) - Date.now()));
          }
        }
        setSelectedId((current) => next.chats.some((chat) => chat.id === current) ? current : (next.chats[0]?.id ?? ""));
        setServerError("");
      }).catch((error: unknown) => {
        if (active) setServerError(error instanceof Error ? error.message : "Could not load local account data.");
      });
    };

    load();
    const socket = io(realtimeUrl, { query: { userId: user.id } });
    socketRef.current = socket;
    socket.on("connect", load);
    socket.on("chat:typing", (event: { senderId?: unknown; recipientId?: unknown; typing?: unknown }) => {
      if (typeof event.senderId !== "string" || event.recipientId !== user.id || typeof event.typing !== "boolean") return;
      const senderId = event.senderId;
      const existingTimer = typingExpiryTimersRef.current.get(senderId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        typingExpiryTimersRef.current.delete(senderId);
      }
      setTypingUserIds((current) => {
        const next = new Set(current);
        if (event.typing) next.add(senderId);
        else next.delete(senderId);
        return next;
      });
      if (event.typing) {
        const timer = window.setTimeout(() => {
          typingExpiryTimersRef.current.delete(senderId);
          setTypingUserIds((current) => {
            if (!current.has(senderId)) return current;
            const next = new Set(current);
            next.delete(senderId);
            return next;
          });
        }, 3200);
        typingExpiryTimersRef.current.set(senderId, timer);
      }
    });
    socket.on("data:changed", (event: { type?: string; recipientId?: string; body?: string }) => {
      load();
      if (event.type === "message" && event.recipientId === user.id && document.hidden && notificationsOn && "Notification" in window && Notification.permission === "granted") {
        new Notification("New INChat message", { body: event.body ?? "" });
      }
    });
    socket.on("presence:changed", load);
    socket.on("location:update", load);
    socket.on("location:expired", load);
    socket.on("location:revoked", load);
    socket.on("connect_error", () => setServerError("Could not connect to the shared local service on port 3005."));
    return () => {
      active = false;
      if (socketRef.current === socket) socketRef.current = null;
      for (const timer of typingExpiryTimersRef.current.values()) window.clearTimeout(timer);
      typingExpiryTimersRef.current.clear();
      setTypingUserIds(new Set());
      socket.disconnect();
    };
  }, [user, notificationsOn, notify, setActiveLocation]);

  const openPage = (next: Page) => { setPage(next); setSearch(""); setMobileChatOpen(false); setShowNewMessage(false); };
  const startPageSwipe = (event: TouchEvent<HTMLElement>) => {
    const target = event.target;
    if (showNewMessage || (page === "Chats" && mobileChatOpen)
      || (target instanceof Element && target.closest("button, input, textarea, select, a, video, [role='dialog'], .status-list, .chat-list, .message-area, .reels-feed"))) {
      pageSwipeStart.current = null;
      return;
    }
    const touch = event.changedTouches[0];
    pageSwipeStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const finishPageSwipe = (event: TouchEvent<HTMLElement>) => {
    const start = pageSwipeStart.current;
    pageSwipeStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 85 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    const pages: Page[] = ["Chats", "Updates", "Reels", "Calls", "Settings"];
    const currentIndex = pages.indexOf(page);
    const nextIndex = Math.max(0, Math.min(pages.length - 1, currentIndex + (deltaX < 0 ? 1 : -1)));
    if (nextIndex !== currentIndex) openPage(pages[nextIndex]);
  };
  const selectedChat = data?.chats.find((chat) => chat.id === selectedId);
  const selectedChatLastMessageId = selectedChat?.messages[selectedChat.messages.length - 1]?.id;
  const selectedChatTheme: ChatTheme = data?.chatPreferences.find((preference) => preference.contactId === selectedId)?.theme ?? defaultChatTheme;
  const unreadMessageCount = data?.chats.reduce((total, chat) => total + chat.unread, 0) ?? 0;
  useEffect(() => {
    if (!user || page !== "Chats" || !selectedChat) return;
    void api.markChatRead(user.id, selectedChat.id).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not mark this conversation as read."));
  }, [notify, page, selectedChat?.id, selectedChatLastMessageId, user?.id]);

  useEffect(() => () => {
    const active = liveLocationRef.current;
    if (active && active.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(active.watchId);
    if (locationExpiryTimer.current !== null) window.clearTimeout(locationExpiryTimer.current);
  }, []);

  const filteredChats = data?.chats.filter((chat) => {
    const needle = search.trim().toLowerCase();
    return !needle || `${chat.name} ${chat.preview} ${chat.messages.map((message) => message.text).join(" ")}`.toLowerCase().includes(needle);
  }) ?? [];
  const selectChat = (chat: Chat) => { setSelectedId(chat.id); setMobileChatOpen(true); };
  const chooseNewMessage = (chat: Chat) => { setSelectedId(chat.id); setShowNewMessage(false); setNewMessageSearch(""); setMobileChatOpen(true); };
  const openConnection = (contactId: string) => {
    const contact = data?.chats.find((chat) => chat.id === contactId);
    if (contact) chooseNewMessage(contact);
  };

  const handleLogin = async (name: string, email: string) => {
    const result = await api.login(name, email);
    localStorage.setItem(userStorageKey, JSON.stringify(result.user));
    setNotificationsOn(localStorage.getItem(`inchat-notifications-${result.user.id}`) === "true");
    setDarkMode(localStorage.getItem(`inchat-theme-${result.user.id}`) === "dark");
    setShowPresenceStatus(localStorage.getItem(presenceStatusStorageKey(result.user.id)) !== "false");
    setUser(result.user);
    setPage("Chats");
    setServerError("");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!user || !selectedChat || !text) return;
    try {
      await api.sendMessage(user.id, selectedChat.id, text);
      setDraft("");
      await refresh(user.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this message.");
    }
  };

  const sendTypedMessage = async (kind: Exclude<MessageKind, "text">, payload: MessagePayloadInput, body = "") => {
    if (!user || !selectedChat) throw new Error("Open a connected conversation before sharing.");
    await api.sendMessage(user.id, selectedChat.id, body, kind, payload);
    await refresh(user.id);
  };

  const cleanupUploadedMedia = async (userId: string, mediaIds: string[], cause: unknown): Promise<never> => {
    const cleanupErrors: string[] = [];
    for (const mediaId of mediaIds) {
      try {
        await api.deleteMedia(mediaId, userId);
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : "An uploaded file could not be removed.");
      }
    }
    if (cleanupErrors.length > 0) {
      const originalMessage = cause instanceof Error ? cause.message : "The content could not be saved.";
      throw new Error(`${originalMessage} Uploaded file cleanup failed: ${cleanupErrors.join("; ")}`);
    }
    throw cause;
  };

  const sendFiles = async (files: File[]) => {
    if (!user || !selectedChat) throw new Error("Open a connected conversation before sharing files.");
    const uploadedIds: string[] = [];
    try {
      for (const file of files) uploadedIds.push((await api.uploadMedia(user.id, file)).id);
      await api.sendMessage(user.id, selectedChat.id, "", "media", { mediaIds: uploadedIds });
    } catch (error) {
      return cleanupUploadedMedia(user.id, uploadedIds, error);
    }
    await refresh(user.id);
  };

  const createPoll = async (question: string, options: string[]) => {
    await sendTypedMessage("poll", { question, options });
  };

  const createEvent = async (event: { title: string; startsAt: string; place: string; description: string }) => {
    await sendTypedMessage("event", event);
  };

  const shareContact = async (contactId: string) => {
    await sendTypedMessage("contact", { contactId });
  };

  const stopLiveLocationShare = async () => {
    const active = liveLocationRef.current;
    if (!active) return;
    if (active.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(active.watchId);
    if (locationExpiryTimer.current !== null) window.clearTimeout(locationExpiryTimer.current);
    locationExpiryTimer.current = null;
    setActiveLocation(null);
    if (user) await api.stopLiveLocation(user.id, active.id);
  };

  const shareLocation = async (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => {
    if (!user || !selectedChat) throw new Error("Open a connected conversation before sharing your location.");
    if (!("geolocation" in navigator)) throw new Error("This browser does not support location sharing.");
    const position = await currentPosition().catch((error: unknown) => { throw locationError(error); });
    const { latitude, longitude, accuracy } = position.coords;
    if (mode === "current") {
      await sendTypedMessage("location", { latitude, longitude, accuracy, consent: true });
      notify("Current location shared with this conversation.");
      return;
    }

    if (liveLocationRef.current) await stopLiveLocationShare();
    const share = await api.startLiveLocation(user.id, selectedChat.id, latitude, longitude, accuracy, durationMinutes);
    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition((nextPosition) => {
        const now = Date.now();
        if (now - lastLocationUpdate.current < 4000) return;
        lastLocationUpdate.current = now;
        void api.updateLiveLocation(user.id, share.shareId, nextPosition.coords.latitude, nextPosition.coords.longitude, nextPosition.coords.accuracy)
          .catch((error: unknown) => {
            notify(error instanceof Error ? error.message : "Could not update your live location.");
            void stopLiveLocationShare().catch((stopError: unknown) => notify(stopError instanceof Error ? stopError.message : "Could not stop the live location share."));
          });
      }, (error) => {
        notify(locationError(error).message);
        void stopLiveLocationShare().catch((stopError: unknown) => notify(stopError instanceof Error ? stopError.message : "Could not stop the live location share."));
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    } catch (error) {
      await api.stopLiveLocation(user.id, share.shareId);
      throw error;
    }
    const active = { id: share.shareId, contactId: selectedChat.id, contactName: selectedChat.name, senderId: user.id, expiresAt: share.expiresAt, watchId };
    setActiveLocation(active);
    const remaining = Math.max(0, Date.parse(share.expiresAt) - Date.now());
    locationExpiryTimer.current = window.setTimeout(() => {
      if (navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      if (liveLocationRef.current?.id === share.shareId) setActiveLocation(null);
      locationExpiryTimer.current = null;
      notify("Live location sharing expired.");
    }, remaining);
    notify(`Live location shared for up to ${durationMinutes} minutes. You can stop it at any time.`);
  };

  const votePoll = async (pollId: number, optionId: number) => {
    if (!user) return;
    await api.votePoll(user.id, pollId, optionId);
    await refresh(user.id);
  };

  const rsvpEvent = async (eventId: number, response: "going" | "interested" | "not_going") => {
    if (!user) return;
    await api.rsvpEvent(user.id, eventId, response);
    await refresh(user.id);
  };

  const changeChatTheme = async (theme: ChatTheme) => {
    if (!user || !selectedChat) throw new Error("Open a connected conversation before changing its theme.");
    const saved = await api.setChatTheme(user.id, selectedChat.id, theme);
    setData((current) => current ? {
      ...current,
      chatPreferences: [
        { contactId: saved.contactId, theme: saved.theme, updatedAt: saved.updatedAt },
        ...current.chatPreferences.filter((preference) => preference.contactId !== saved.contactId),
      ],
    } : current);
    notify("Chat theme saved.");
  };

  const sendConnectionRequest = async (recipientId: string) => {
    if (!user) return;
    try {
      await api.sendConnectionRequest(user.id, recipientId);
      await refresh(user.id);
      notify("Connection request sent.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this connection request.");
    }
  };

  const acceptConnectionRequest = async (requestId: number) => {
    if (!user) return;
    const request = data?.incomingRequests.find((item) => item.id === requestId);
    try {
      await api.acceptConnectionRequest(requestId, user.id);
      await refresh(user.id);
      setShowNewMessage(false);
      if (request) {
        setSelectedId(request.senderId);
        setMobileChatOpen(true);
      }
      notify("Connection accepted. Chat is now open.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not accept this connection request.");
    }
  };

  const declineConnectionRequest = async (requestId: number) => {
    if (!user) return;
    try {
      await api.declineConnectionRequest(requestId, user.id);
      await refresh(user.id);
      notify("Connection request declined.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not decline this connection request.");
    }
  };

  const startCall = (contactId: string, kind: "voice" | "video") => {
    if (!user) return;
    const contact = data?.chats.find((chat) => chat.id === contactId);
    if (!contact) {
      notify("This connection is no longer available.");
      return;
    }
    void callSession.startCall(contactId, contact.name, kind).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not start this call."));
  };

  const deleteChat = async (chat: Chat) => {
    if (!user || !window.confirm(`Permanently delete the conversation with ${chat.name} for both accounts? This removes its messages, call history, and connection and cannot be undone.`)) return;
    try {
      const result = await api.deleteChat(user.id, chat.id);
      await refresh(user.id);
      setMobileChatOpen(false);
      notify(`Conversation deleted for both accounts (${result.deletedMessages} messages and ${result.deletedCalls} calls removed).`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete this conversation.");
    }
  };

  const deleteCallHistoryEntry = async (callId: number) => {
    if (!user || !window.confirm("Delete this call record for both connected accounts? This cannot be undone.")) return;
    try {
      await api.deleteCall(callId, user.id);
      await refresh(user.id);
      notify("Call record deleted for both accounts.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete this call record.");
    }
  };

  const clearCallHistory = async () => {
    if (!user || !window.confirm("Delete all call history shared with your connected accounts? The records will be removed for both participants. Active calls will not be affected.")) return;
    try {
      const result = await api.clearCallHistory(user.id);
      await refresh(user.id);
      notify(`${result.deletedCalls} call records deleted for both accounts.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not clear call history.");
    }
  };

  const publishUpdate = async (file: File, caption: string) => {
    if (!user) throw new Error("Sign in before sharing an update.");
    const media = await api.uploadMedia(user.id, file);
    try {
      await api.createUpdate(user.id, media.id, caption);
    } catch (error) {
      return cleanupUploadedMedia(user.id, [media.id], error);
    }
    await refresh(user.id);
  };

  const createNote = async (text: string) => {
    if (!user) throw new Error("Sign in before sharing a note.");
    await api.createNote(user.id, text);
    await refresh(user.id);
  };

  const deleteUpdate = async (updateId: string) => {
    if (!user) throw new Error("Sign in before deleting an update.");
    await api.deleteUpdate(updateId, user.id);
    await refresh(user.id);
  };

  const deleteNote = async (noteId: string) => {
    if (!user) throw new Error("Sign in before deleting a note.");
    await api.deleteNote(noteId, user.id);
    await refresh(user.id);
  };

  const createFeedPost = async (kind: "post" | "reel", file: File | null, caption: string) => {
    if (!user) throw new Error("Sign in before sharing a post.");
    const media = file ? await api.uploadMedia(user.id, file) : null;
    try {
      await api.createFeedPost(user.id, kind, media?.id ?? null, caption);
    } catch (error) {
      if (media) return cleanupUploadedMedia(user.id, [media.id], error);
      throw error;
    }
    await refresh(user.id);
  };

  const shareFeedPost = async (postId: string, contactId: string) => {
    if (!user) throw new Error("Sign in before sharing a post.");
    if (!data?.chats.some((chat) => chat.id === contactId)) {
      throw new Error("Choose an accepted connection to share this post.");
    }
    await api.sendMessage(user.id, contactId, "", "feed", { postId });
    await refresh(user.id);
  };

  const feedAction = async (postId: string, action: "like" | "repost" | "save", active: boolean) => {
    if (!user) return;
    await api.feedAction(postId, user.id, action, active);
    await refresh(user.id);
  };

  const loadFeedComments = async (postId: string) => {
    if (!user) throw new Error("Sign in before viewing comments.");
    return (await api.getFeedComments(postId, user.id)).comments;
  };

  const addFeedComment = async (postId: string, text: string) => {
    if (!user) throw new Error("Sign in before commenting.");
    const comment = await api.addFeedComment(postId, user.id, text);
    await refresh(user.id);
    return comment;
  };

  const deleteFeedPost = async (postId: string) => {
    if (!user || !window.confirm("Delete this post and its saved media? This cannot be undone.")) return;
    await api.deleteFeedPost(postId, user.id);
    await refresh(user.id);
  };

  const markAllRead = async () => {
    if (!user) return;
    try {
      await api.markAllRead(user.id);
      await refresh(user.id);
      notify("All conversations marked as read.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not mark conversations as read.");
    }
  };

  const toggleNotifications = async () => {
    if (!user) return;
    if (notificationsOn) {
      setNotificationsOn(false);
      localStorage.setItem(`inchat-notifications-${user.id}`, "false");
      return;
    }
    if (!("Notification" in window)) {
      notify("This browser does not support desktop notifications.");
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      notify("Allow browser notifications to turn this setting on.");
      return;
    }
    setNotificationsOn(true);
    localStorage.setItem(`inchat-notifications-${user.id}`, "true");
  };

  const toggleTheme = () => {
    if (!user) return;
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem(`inchat-theme-${user.id}`, next ? "dark" : "light");
  };

  const togglePresenceStatus = () => {
    if (!user) return;
    const next = !showPresenceStatus;
    setShowPresenceStatus(next);
    localStorage.setItem(presenceStatusStorageKey(user.id), String(next));
  };

  const clearStorage = async () => {
    const accountId = user?.id;
    if (!accountId) return;
    if (!window.confirm("Delete messages and call history for both apps? Account identities and accepted connections will be kept.")) return;
    try {
      await api.clearStorage();
      await refresh(accountId);
      notify("Messages and call history cleared. Connections were kept.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not clear local storage.");
    }
  };

  const signOut = () => {
    void stopLiveLocationShare().catch((error: unknown) => notify(error instanceof Error ? error.message : "The live location share could not be stopped."));
    localStorage.removeItem(userStorageKey);
    setUser(null);
    setData(null);
    setSelectedId("");
    setPage("Chats");
  };

  if (!user) return <div className="app-shell"><LoginPage onLogin={handleLogin} error={serverError} /></div>;
  if (!data) return <div className="app-shell loading-shell">
    <div className="loading-card"><span className="brand-mark">IN</span><strong>{serverError || "Connecting to shared INChat storage…"}</strong><button className="primary-button" onClick={() => void refresh(user.id)}>Retry connection</button><button className="text-button" onClick={signOut}>Sign out</button></div>
  </div>;

  return <div className={`app-shell is-authenticated${darkMode ? " theme-dark" : ""}${page === "Chats" ? " is-chats-page" : ""}${page === "Chats" && mobileChatOpen ? " is-mobile-chat" : ""}`}>
    <Topbar showMore={showMore} setShowMore={setShowMore} markAllRead={() => void markAllRead()} notify={notify} onHome={() => openPage("Chats")} unreadCount={unreadMessageCount} />
    {serverError && <div className="connection-banner" role="alert">{serverError}</div>}
    {liveLocation && <div className="live-location-bar" role="status"><Icon name="location" size={17} /><span>{liveLocation.senderId === user.id ? <>Sharing live location with <strong>{liveLocation.contactName}</strong></> : <><strong>{liveLocation.contactName}</strong> is sharing live location with you</>} until {new Date(liveLocation.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>{liveLocation.senderId === user.id && <button type="button" onClick={() => void stopLiveLocationShare().then(() => notify("Live location sharing stopped.")).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not stop live location sharing."))}>Stop sharing</button>}</div>}
    <main className="main-content" onTouchStart={startPageSwipe} onTouchEnd={finishPageSwipe} onTouchCancel={() => { pageSwipeStart.current = null; }}>
      {page === "Chats" && (showNewMessage
        ? <NewMessageModal directory={data.directory} incomingRequests={data.incomingRequests} search={newMessageSearch} setSearch={setNewMessageSearch} onClose={() => { setShowNewMessage(false); setNewMessageSearch(""); }} onChoose={openConnection} onRequest={sendConnectionRequest} onAccept={acceptConnectionRequest} onDecline={declineConnectionRequest} />
        : <ChatsPage user={user} chats={filteredChats} calls={data.calls} selectedChat={selectedChat} selectedId={selectedId} search={search} setSearch={setSearch} draft={draft} setDraft={setDraft} mobileOpen={mobileChatOpen} pendingRequestCount={data.incomingRequests.length} chatTheme={selectedChatTheme} showPresenceStatus={showPresenceStatus} typingUserIds={typingUserIds} onTypingChange={emitTyping} onCall={(contactId, kind) => startCall(contactId, kind)} onSelect={selectChat} onBack={() => setMobileChatOpen(false)} onNewMessage={() => { setNewMessageSearch(""); setShowNewMessage(true); }} onDeleteChat={(chat) => void deleteChat(chat)} onSend={sendMessage} onPollVote={(pollId, optionId) => void votePoll(pollId, optionId).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not vote in this poll."))} onEventRsvp={(eventId, response) => void rsvpEvent(eventId, response).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not update your event response."))} onShareFiles={sendFiles} onShareLocation={shareLocation} onCreatePoll={createPoll} onCreateEvent={createEvent} onShareContact={shareContact} onThemeChange={(theme) => changeChatTheme(theme)} />)}
      {page === "Updates" && <UpdatesPage user={user} updates={data.updates} notes={data.notes} onAddUpdate={publishUpdate} onCreateNote={createNote} onDeleteUpdate={deleteUpdate} onDeleteNote={deleteNote} notify={notify} />}
      {page === "Reels" && <ReelsPage feed={data.feed} chats={data.chats} userId={user.id} onCreatePost={createFeedPost} onShare={shareFeedPost} onLike={(postId, active) => feedAction(postId, "like", active)} onSave={(postId, active) => feedAction(postId, "save", active)} onRepost={(postId, active) => feedAction(postId, "repost", active)} onComment={addFeedComment} onLoadComments={loadFeedComments} onConnect={sendConnectionRequest} onDeletePost={deleteFeedPost} notify={notify} />}
      {page === "Calls" && <CallsPage calls={data.calls} onCall={(contactId, kind) => void startCall(contactId, kind)} onDeleteCall={(callId) => void deleteCallHistoryEntry(callId)} onClearCallHistory={() => void clearCallHistory()} />}
      {page === "Settings" && <SettingsPage user={user} storage={data.storage} notificationsOn={notificationsOn} darkMode={darkMode} showPresenceStatus={showPresenceStatus} onToggleNotifications={() => void toggleNotifications()} onToggleDarkMode={toggleTheme} onTogglePresenceStatus={togglePresenceStatus} onClearStorage={() => void clearStorage()} onSignOut={signOut} />}
    </main>
    {callSession.activeCall && <CallOverlay
      peerOnline={Boolean(data.chats.find((chat) => chat.id === callSession.activeCall?.peerId)?.online)}
      call={callSession.activeCall}
      localStream={callSession.localStream}
      remoteStream={callSession.remoteStream}
      muted={callSession.muted}
      cameraEnabled={callSession.cameraEnabled}
      cameraSwitchSupported={callSession.cameraSwitchSupported}
      noiseSuppression={callSession.noiseSuppression}
      audioTouchUp={callSession.audioTouchUp}
      audioSettingsSupport={callSession.audioSettingsSupport}
      error={callSession.callError}
      onAccept={callSession.acceptCall}
      onFinish={() => callSession.finishCall()}
      onToggleMicrophone={callSession.toggleMicrophone}
      onToggleCamera={callSession.toggleCamera}
      onToggleCameraFacing={callSession.toggleCameraFacing}
      onToggleNoiseSuppression={callSession.toggleNoiseSuppression}
      onToggleAudioTouchUp={callSession.toggleAudioTouchUp}
      onError={notify}
    />}
    <BottomNav page={page} onNavigate={openPage} />
    {toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
  </div>;
}

export default App;
