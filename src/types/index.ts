export type Page = "Chats" | "Updates" | "Reels" | "Calls" | "Settings";

type ChatThemeTile = 1 | 2 | 3 | 4;
type BubbleThemeCategory = "featured" | "nature" | "live" | "minimal" | "doodle";
type WallpaperThemeCategory = "featured" | "nature" | "live" | "vibrant" | "gradient" | "colour";
export type ChatBubbleTheme = `${BubbleThemeCategory}-${ChatThemeTile}`;
export type ChatWallpaperTheme = "none" | `${WallpaperThemeCategory}-${ChatThemeTile}`;
export type ChatTheme = { bubble: ChatBubbleTheme; wallpaper: ChatWallpaperTheme };

export type IconName =
  | "search" | "camera" | "more" | "plus" | "chat" | "updates" | "movie"
  | "call" | "callEnd" | "settings" | "video" | "videoOff" | "back" | "send" | "attach" | "smile"
  | "user" | "lock" | "bell" | "palette" | "storage" | "chevron" | "play"
  | "heart" | "eye" | "missed" | "close" | "check" | "phone-out" | "mic" | "micOff"
  | "flipCamera" | "volumeUp" | "volumeOff" | "minimize" | "moreVertical"
  | "noiseSuppression" | "touchUp" | "location" | "poll" | "event" | "image" | "contact" | "document" | "ai"
  | "repost" | "bookmark" | "edit" | "delete" | "share" | "pause";

export type MediaFile = { id: string; name: string; mimeType: string; sizeBytes: number; url: string };
export type MessageKind = "text" | "media" | "contact" | "poll" | "event" | "location" | "feed";
export type PollOption = { id: number; text: string; votes: number; selected: boolean };
export type PollPayload = {
  id: number;
  question: string;
  options: PollOption[];
  totalVotes: number;
  expiresAt: string | null;
};
export type EventPayload = {
  id: number;
  title: string;
  startsAt: string;
  place: string;
  description: string;
  rsvpCount: number;
  myRsvp: "going" | "interested" | "not_going" | null;
};
export type MessagePayload =
  | { kind: "text" }
  | { kind: "media"; files: MediaFile[] }
  | { kind: "contact"; contact: { id: string; name: string; email: string } | null }
  | { kind: "feed"; post: { id: string; kind: "post" | "reel"; authorName: string; caption: string; media: MediaFile | null } | null }
  | { kind: "poll"; poll: PollPayload }
  | { kind: "event"; event: EventPayload }
  | { kind: "location"; latitude: number | null; longitude: number | null; accuracy: number | null; liveShareId?: string; expiresAt?: string | null };
export type MessagePayloadInput =
  | { mediaIds: string[] }
  | { contactId: string }
  | { postId: string }
  | { question: string; options: string[] }
  | { title: string; startsAt: string; place: string; description: string }
  | { latitude: number; longitude: number; accuracy: number | null; consent?: true; liveShareId?: string; expiresAt?: string };
export type Message = {
  id: number;
  author: "me" | "them";
  text: string;
  time: string;
  createdAt: string;
  kind: MessageKind;
  payload?: MessagePayload;
};

export type Chat = {
  id: string;
  name: string;
  email: string;
  initials: string;
  preview: string;
  time: string;
  unread: number;
  lastReadMessageId?: number;
  lastReadAt?: string | null;
  peerLastReadMessageId?: number;
  peerLastReadAt?: string | null;
  bg: string;
  fg: string;
  online?: boolean;
  messages: Message[];
};

export type DirectoryUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
  bg: string;
  fg: string;
  online: boolean;
  status: "available" | "outgoing" | "incoming" | "connected";
};
export type ConnectionRequest = {
  id: number;
  senderId: string;
  senderName: string;
  senderEmail: string;
  createdAt: string;
};
export type User = { id: string; email: string; name: string; createdAt: string };
export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  kind: "post" | "reel";
  media: MediaFile | null;
  caption: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  connectionStatus?: DirectoryUser["status"] | "self";
  comments?: FeedComment[];
};
export type FeedComment = { id: string; authorId: string; authorName: string; text: string; createdAt: string; parentId?: string | null };
export type StoryUpdate = {
  id: string;
  authorId: string;
  authorName: string;
  initials?: string;
  media: MediaFile | null;
  caption: string;
  createdAt: string;
  expiresAt: string;
};
export type UserNote = {
  id: string;
  authorId: string;
  authorName: string;
  initials?: string;
  text: string;
  createdAt: string;
  expiresAt: string;
};
export type ChatPreference = { contactId: string; theme: ChatTheme };
export type LiveLocationShare = {
  id: string;
  senderId: string;
  recipientId: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  createdAt: string;
  updatedAt: string | null;
  expiresAt: string;
};
export type CallEntry = {
  id: number;
  contactId: string;
  name: string;
  initials: string;
  bg: string;
  fg: string;
  kind: "voice" | "video";
  direction: "incoming" | "outgoing";
  status: "ringing" | "active" | "completed" | "missed" | "declined" | "cancelled" | "failed";
  durationSeconds: number;
  time: string;
  createdAt: string;
  endedAt: string | null;
};
export type StorageInfo = {
  databaseBytes: number;
  mediaBytes?: number;
  mediaFiles?: number;
  users: number;
  messages: number;
  calls: number;
  connections: number;
  pendingRequests: number;
  posts?: number;
  stories?: number;
  notes?: number;
};
export type BootstrapData = {
  user: User;
  chats: Chat[];
  calls: CallEntry[];
  directory: DirectoryUser[];
  incomingRequests: ConnectionRequest[];
  storage: StorageInfo;
  feed: FeedPost[];
  updates: StoryUpdate[];
  notes: UserNote[];
  chatPreferences: ChatPreference[];
  locationShares: LiveLocationShare[];
};
export type Reel = { name: string; initials: string; title: string; views: string; duration: string; style: string; bg: string };
