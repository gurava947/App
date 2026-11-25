import { ChatSidebar } from "./ChatSidebar";
import { ConversationPanel } from "./ConversationPanel";
import { Icon } from "../Icon";
import type { CallEntry, Chat, ChatTheme, UserNote } from "../../types";
import "./Chats.css";

export function ChatsPage({ chats, calls, notes, selectedChat, selectedId, search, setSearch, draft, setDraft, mobileOpen, pendingRequestCount, chatTheme, onSelect, onBack, onNewMessage, onOpenNotes, onSend, onCall, onPollVote, onEventRsvp, onShareFiles, onShareLocation, onCreatePoll, onCreateEvent, onShareContact, onThemeChange, onClearChat }: {
  chats: Chat[];
  calls: CallEntry[];
  notes: UserNote[];
  selectedChat?: Chat;
  selectedId: string;
  search: string;
  setSearch: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  mobileOpen: boolean;
  pendingRequestCount: number;
  chatTheme: ChatTheme;
  onSelect: (chat: Chat) => void;
  onBack: () => void;
  onNewMessage: () => void;
  onOpenNotes: () => void;
  onSend: React.FormEventHandler<HTMLFormElement>;
  onCall: (kind: "voice" | "video") => void;
  onPollVote: (pollId: number, optionId: number) => void;
  onEventRsvp: (eventId: number, response: "going" | "interested" | "not_going") => void;
  onShareFiles: (files: File[]) => Promise<void>;
  onShareLocation: (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onCreateEvent: (event: { title: string; startsAt: string; place: string; description: string }) => Promise<void>;
  onShareContact: (contactId: string) => Promise<void>;
  onThemeChange: (theme: ChatTheme) => void;
  onClearChat: () => void;
}) {
  return <section className={`chat-workspace${mobileOpen ? " mobile-chat-open" : ""}`} aria-label="Chats">
    <ChatSidebar chats={chats} notes={notes} selectedId={selectedId} search={search} setSearch={setSearch} pendingRequestCount={pendingRequestCount} onSelect={onSelect} onNewMessage={onNewMessage} onOpenNotes={onOpenNotes} />
    {selectedChat
      ? <ConversationPanel chat={selectedChat} chats={chats} calls={calls.filter((call) => call.contactId === selectedChat.id)} theme={chatTheme} draft={draft} setDraft={setDraft} onSend={onSend} onBack={onBack} onCall={onCall} onPollVote={onPollVote} onEventRsvp={onEventRsvp} onShareFiles={onShareFiles} onShareLocation={onShareLocation} onCreatePoll={onCreatePoll} onCreateEvent={onCreateEvent} onShareContact={onShareContact} onThemeChange={onThemeChange} onClearChat={onClearChat} />
      : <div className="conversation-empty"><span className="empty-search-icon"><Icon name="chat" size={20} /></span><strong>No conversations yet</strong><span>Start a chat by sending a connection request. After the other person accepts, open their conversation to send messages.</span><button className="primary-button" type="button" onClick={onNewMessage}>Start a chat</button></div>}
  </section>;
}
