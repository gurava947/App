import type { BootstrapData, ChatTheme, FeedComment, FeedPost, MediaFile, MessageKind, MessagePayloadInput, StorageInfo, StoryUpdate, User, UserNote } from "../types";

const apiBase = `${window.location.protocol}//${window.location.hostname}:3005/api`;
export const realtimeUrl = `${window.location.protocol}//${window.location.hostname}:3005`;

function absoluteMedia(media: MediaFile): MediaFile {
  return { ...media, url: new URL(media.url, realtimeUrl).toString() };
}

function normalizeBootstrap(data: BootstrapData): BootstrapData {
  return {
    ...data,
    chats: data.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => message.payload?.kind === "media"
        ? { ...message, payload: { ...message.payload, files: message.payload.files.map(absoluteMedia) } }
        : message),
    })),
    feed: data.feed.map((post) => ({ ...post, media: post.media ? absoluteMedia(post.media) : null })),
    updates: data.updates.map((update) => ({ ...update, media: update.media ? absoluteMedia(update.media) : null })),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error("Cannot reach the local INChat server. Start it with npm run dev:server.");
  }

  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Local API request failed (${response.status}).`);
  return result;
}

export const api = {
  login: (name: string, email: string) => request<{ user: User }>("/login", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  }),
  bootstrap: async (userId: string) => normalizeBootstrap(await request<BootstrapData>(`/bootstrap?userId=${encodeURIComponent(userId)}`)),
  uploadMedia: async (userId: string, file: File) => {
    let response: Response;
    try {
      response = await fetch(`${apiBase}/media`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-User-Id": userId,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
    } catch {
      throw new Error("Cannot upload media to the local INChat server.");
    }
    const result = await response.json() as { media?: MediaFile; error?: string };
    if (!response.ok) throw new Error(result.error ?? `Media upload failed (${response.status}).`);
    if (!result.media) throw new Error("The server did not return the uploaded media.");
    return absoluteMedia(result.media);
  },
  sendMessage: (senderId: string, recipientId: string, body: string, kind: MessageKind = "text", payload?: MessagePayloadInput) => request<{ id: number; createdAt: string }>("/messages", {
    method: "POST",
    body: JSON.stringify({ senderId, recipientId, body, kind, ...(payload ? { payload } : {}) }),
  }),
  createFeedPost: (userId: string, kind: "post" | "reel", mediaId: string | null, caption: string) => request<{ post: FeedPost }>("/feed", {
    method: "POST",
    body: JSON.stringify({ userId, kind, mediaId, caption }),
  }),
  feedAction: (postId: string, userId: string, action: "like" | "repost" | "save", active: boolean) => request<{ liked?: boolean; saved?: boolean; reposted?: boolean }>(
    `/feed/${encodeURIComponent(postId)}/${action}${active ? "" : `?userId=${encodeURIComponent(userId)}`}`,
    active ? { method: "POST", body: JSON.stringify({ userId }) } : { method: "DELETE" },
  ),
  addFeedComment: async (postId: string, userId: string, text: string) => {
    const result = await request<{ comment: FeedComment }>(`/feed/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ userId, text }),
    });
    if (!result.comment) throw new Error("The server did not return the saved comment.");
    return result.comment;
  },
  getFeedComments: (postId: string, userId: string) => request<{ comments: FeedComment[] }>(`/feed/${encodeURIComponent(postId)}/comments?userId=${encodeURIComponent(userId)}`),
  deleteMedia: (mediaId: string, userId: string) => request<{ deleted: boolean }>(`/media/${encodeURIComponent(mediaId)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  deleteFeedPost: (postId: string, userId: string) => request<{ deleted: boolean }>(`/feed/${encodeURIComponent(postId)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  createUpdate: (userId: string, mediaId: string, caption: string) => request<{ update: StoryUpdate }>("/updates", {
    method: "POST",
    body: JSON.stringify({ userId, mediaId, caption }),
  }),
  deleteUpdate: (updateId: string, userId: string) => request<{ deleted: boolean }>(`/updates/${encodeURIComponent(updateId)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  createNote: (userId: string, text: string) => request<{ note: UserNote }>("/notes", {
    method: "POST",
    body: JSON.stringify({ userId, text }),
  }),
  deleteNote: (noteId: string, userId: string) => request<{ deleted: boolean }>(`/notes/${encodeURIComponent(noteId)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  markChatRead: (userId: string, contactId: string) => request<{ markedRead: boolean }>(`/chats/${encodeURIComponent(contactId)}/read`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  }),
  markAllRead: (userId: string) => request<{ markedRead: boolean }>("/messages/read-all", {
    method: "POST",
    body: JSON.stringify({ userId }),
  }),
  setChatTheme: (userId: string, contactId: string, theme: ChatTheme) => request<{ contactId: string; theme: ChatTheme; updatedAt: string }>(`/chats/${encodeURIComponent(contactId)}/preferences`, {
    method: "PUT",
    body: JSON.stringify({ userId, theme }),
  }),
  clearChat: (userId: string, contactId: string) => request<{ deleted: boolean; deletedMessages: number }>(`/chats/${encodeURIComponent(contactId)}`, {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  }),
  votePoll: (userId: string, pollId: number, optionId: number) => request<{ voted: boolean }>(`/polls/${pollId}/votes`, {
    method: "POST",
    body: JSON.stringify({ userId, optionId }),
  }),
  rsvpEvent: (userId: string, eventId: number, response: "going" | "interested" | "not_going") => request<{ saved: boolean }>(`/events/${eventId}/rsvp`, {
    method: "POST",
    body: JSON.stringify({ userId, response }),
  }),
  startLiveLocation: async (userId: string, recipientId: string, latitude: number, longitude: number, accuracy: number | null, durationMinutes: 5 | 10 | 15) => {
    const result = await request<{ share: { id: string; expiresAt: string } }>("/location-shares", {
    method: "POST",
      body: JSON.stringify({ userId, recipientId, consent: true, coords: { latitude, longitude, accuracy }, durationMinutes }),
    });
    return { shareId: result.share.id, expiresAt: result.share.expiresAt };
  },
  updateLiveLocation: (userId: string, shareId: string, latitude: number, longitude: number, accuracy: number | null) => request<{ updated: boolean }>(`/location-shares/${encodeURIComponent(shareId)}`, {
    method: "PATCH",
    body: JSON.stringify({ userId, latitude, longitude, accuracy }),
  }),
  stopLiveLocation: (userId: string, shareId: string) => request<{ stopped: boolean }>(`/location-shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  }),
  sendConnectionRequest: (senderId: string, recipientId: string) => request<{ id: number; status: "pending" }>("/connection-requests", {
    method: "POST",
    body: JSON.stringify({ senderId, recipientId }),
  }),
  acceptConnectionRequest: (requestId: number, userId: string) => request<{ connected: boolean }>(`/connection-requests/${requestId}/accept`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  }),
  declineConnectionRequest: (requestId: number, userId: string) => request<{ declined: boolean }>(`/connection-requests/${requestId}/decline`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  }),
  clearStorage: () => request<{ cleared: boolean; storage: StorageInfo }>("/storage", { method: "DELETE" }),
};
