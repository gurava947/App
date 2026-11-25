import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { ChatToolsSheet } from "./ChatToolsSheet";
import { MessageContent } from "./MessageContent";
import type { CallEntry, Chat } from "../../types";

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function endedTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function callOutcome(call: CallEntry) {
  switch (call.status) {
    case "completed": return "ended";
    case "missed": return "missed";
    case "declined": return "declined";
    case "cancelled": return "cancelled";
    case "failed": return "failed";
    case "active": return "in progress";
    case "ringing": return "not answered";
  }
}

export function ConversationPanel({ chat, chats, calls, theme, draft, setDraft, onSend, onBack, onCall, onPollVote, onEventRsvp, onShareFiles, onShareLocation, onCreatePoll, onCreateEvent, onShareContact, onThemeChange, onClearChat }: {
  chat: Chat;
  chats: Chat[];
  calls: CallEntry[];
  theme: "default" | "mint" | "sunset" | "midnight";
  draft: string;
  setDraft: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onCall: (kind: "voice" | "video") => void;
  onPollVote: (pollId: number, optionId: number) => void;
  onEventRsvp: (eventId: number, response: "going" | "interested" | "not_going") => void;
  onShareFiles: (files: File[]) => Promise<void>;
  onShareLocation: (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onCreateEvent: (event: { title: string; startsAt: string; place: string; description: string }) => Promise<void>;
  onShareContact: (contactId: string) => Promise<void>;
  onThemeChange: (theme: "default" | "mint" | "sunset" | "midnight") => void;
  onClearChat: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const previousChatId = useRef(chat.id);
  const followLatestMessage = useRef(true);
  const timeline = [
    ...chat.messages.map((message) => ({
      type: "message" as const,
      key: `message-${message.id}`,
      timestamp: message.createdAt,
      message,
    })),
    ...calls.flatMap((call) => [
      {
        type: "call" as const,
        key: `call-${call.id}-started`,
        timestamp: call.createdAt,
        call,
        phase: "started" as const,
      },
      ...(call.endedAt ? [{
        type: "call" as const,
        key: `call-${call.id}-ended`,
        timestamp: call.endedAt,
        call,
        phase: "ended" as const,
      }] : []),
    ]),
  ].sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));

  useLayoutEffect(() => {
    if (previousChatId.current !== chat.id) {
      previousChatId.current = chat.id;
      followLatestMessage.current = true;
    }

    const messageArea = messageAreaRef.current;
    if (messageArea && followLatestMessage.current) messageArea.scrollTop = messageArea.scrollHeight;
  });

  return <section className={`conversation-panel chat-theme-${theme}`} aria-label={`Conversation with ${chat.name}`}>
    <div className="conversation-head">
      <button className="mobile-back icon-button" aria-label="Back to chats" onClick={onBack}><Icon name="back" /></button>
      <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={chat.online} className="conversation-avatar" />
      <div className="contact-meta"><strong>{chat.name}</strong><span>{chat.online ? <><i className="online-text-dot" /> Online now</> : "Last seen recently"}</span></div>
      <div className="conversation-actions">
        <button className="icon-button subtle-action" aria-label={`Voice call ${chat.name}`} onClick={() => onCall("voice")}><Icon name="call" /></button>
        <button className="icon-button subtle-action" aria-label={`Video call ${chat.name}`} onClick={() => onCall("video")}><Icon name="video" /></button>
        <div className="chat-more-wrap">
          <button className="icon-button subtle-action more-contact" aria-label="Conversation details" aria-expanded={chatMenuOpen} onClick={() => setChatMenuOpen((open) => !open)}><Icon name="more" /></button>
          {chatMenuOpen && <div className="chat-more-menu">
            <label>Chat theme<select value={theme} onChange={(event) => {
              const value = event.target.value;
              if (value === "mint" || value === "sunset" || value === "midnight") onThemeChange(value);
              else onThemeChange("default");
            }}><option value="default">Classic</option><option value="mint">Mint</option><option value="sunset">Sunset</option><option value="midnight">Midnight</option></select></label>
            <button type="button" disabled title="AI provider approval is required"><Icon name="ai" size={16} /> AI wallpaper · approval required</button>
            <button type="button" className="clear-chat-action" onClick={() => { setChatMenuOpen(false); onClearChat(); }}>Clear this conversation</button>
          </div>}
        </div>
      </div>
    </div>
    <div className="message-area" ref={messageAreaRef} onScroll={(event) => {
      const area = event.currentTarget;
      followLatestMessage.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    }}>
      <div className="day-divider"><span>MESSAGES</span></div>
      <div className="chat-welcome"><Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} className="welcome-avatar" /><strong>{chat.name}</strong><span>You’re connected on INChat</span></div>
      {timeline.map((item, index) => item.type === "message"
        ? <div key={item.key} className={`message-row ${item.message.author === "me" ? "mine" : "theirs"}`}>
          {item.message.author === "them" && index === timeline.length - 1 && <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} className="message-avatar" />}
          <div className={`message-bubble ${item.message.author === "me" ? "mine-bubble" : "their-bubble"}`}>
            {item.message.text && <p>{item.message.text}</p>}
            <MessageContent message={item.message} onPollVote={onPollVote} onEventRsvp={onEventRsvp} />
            <span className="message-time">{item.message.time}{item.message.author === "me" && <Icon name="check" size={13} />}</span>
          </div>
        </div>
        : <div key={item.key} className="call-history-event">
          <span className="call-history-icon"><Icon name={item.call.kind === "video" ? "video" : "call"} size={17} /></span>
          <span className="call-history-copy">
            <strong>{item.call.kind === "video" ? "Video" : "Audio"} call {item.phase === "started" ? "started" : callOutcome(item.call)}</strong>
            <small>{item.phase === "ended" && item.call.status === "completed" ? `Duration ${durationLabel(item.call.durationSeconds)} · ` : ""}{item.phase === "ended" ? endedTime(item.timestamp) : item.call.time}</small>
          </span>
        </div>)}
    </div>
    <form className="composer" onSubmit={onSend}>
      <button type="button" className="composer-tool" aria-label="Open message tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen(true)}><Icon name="attach" /></button>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${chat.name.split(" ")[0]}...`} aria-label="Write a message" />
      <button type="button" className="composer-tool emoji-tool" aria-label="Add an emoji" onClick={() => setDraft(`${draft}${draft ? " " : ""}😊`)}><Icon name="smile" /></button>
      <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}><Icon name="send" size={19} /></button>
    </form>
    {toolsOpen && <ChatToolsSheet
      contacts={chats}
      onClose={() => setToolsOpen(false)}
      onFile={onShareFiles}
      onLocation={onShareLocation}
      onPoll={onCreatePoll}
      onEvent={onCreateEvent}
      onContact={onShareContact}
    />}
  </section>;
}
