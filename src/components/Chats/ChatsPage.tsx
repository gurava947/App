import { ChatSidebar } from "./ChatSidebar";
import { ConversationPanel } from "./ConversationPanel";
import type { CallEntry, Chat, ChatTheme, User } from "../../types";
import "./Chats.css";

export function ChatsPage({ user, chats, calls, selectedChat, selectedId, search, setSearch, draft, setDraft, mobileOpen, pendingRequestCount, chatTheme, showPresenceStatus, typingUserIds, onTypingChange, onCall, onSelect, onBack, onNewMessage, onSend, onPollVote, onEventRsvp, onShareFiles, onShareLocation, onCreatePoll, onCreateEvent, onShareContact, onThemeChange }: {
  user: User;
  chats: Chat[];
  calls: CallEntry[];
  selectedChat?: Chat;
  selectedId: string;
  search: string;
  setSearch: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  mobileOpen: boolean;
  pendingRequestCount: number;
  chatTheme: ChatTheme;
  showPresenceStatus: boolean;
  typingUserIds: ReadonlySet<string>;
  onTypingChange: (recipientId: string, typing: boolean) => void;
  onCall: (contactId: string, kind: "voice" | "video") => void;
  onSelect: (chat: Chat) => void;
  onBack: () => void;
  onNewMessage: () => void;
  onSend: React.FormEventHandler<HTMLFormElement>;
  onPollVote: (pollId: number, optionId: number) => void;
  onEventRsvp: (eventId: number, response: "going" | "interested" | "not_going") => void;
  onShareFiles: (files: File[]) => Promise<void>;
  onShareLocation: (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onCreateEvent: (event: { title: string; startsAt: string; place: string; description: string }) => Promise<void>;
  onShareContact: (contactId: string) => Promise<void>;
  onThemeChange: (theme: ChatTheme) => Promise<void>;
}) {
  return <section className={`chat-workspace${mobileOpen ? " mobile-chat-open" : ""}`} aria-label="Chats">
    <ChatSidebar chats={chats} selectedId={selectedId} search={search} setSearch={setSearch} pendingRequestCount={pendingRequestCount} typingUserIds={typingUserIds} showPresenceStatus={showPresenceStatus} onSelect={onSelect} onNewMessage={onNewMessage} />
    {selectedChat
      ? <ConversationPanel user={user} chat={selectedChat} chats={chats} calls={calls.filter((call) => call.contactId === selectedChat.id)} theme={chatTheme} showPresenceStatus={showPresenceStatus} draft={draft} setDraft={setDraft} isTyping={typingUserIds.has(selectedChat.id)} onTypingChange={onTypingChange} onCall={onCall} onSend={onSend} onBack={onBack} onPollVote={onPollVote} onEventRsvp={onEventRsvp} onShareFiles={onShareFiles} onShareLocation={onShareLocation} onCreatePoll={onCreatePoll} onCreateEvent={onCreateEvent} onShareContact={onShareContact} onThemeChange={onThemeChange} />
      : null}
  </section>;
}
