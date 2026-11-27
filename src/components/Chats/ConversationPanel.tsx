import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { ChatToolsSheet } from "./ChatToolsSheet";
import { ChatThemePicker } from "./ChatThemePicker";
import { MessageContent } from "./MessageContent";
import { chatBubbleThemes, chatWallpaperThemes } from "../../data/chatThemes";
import type { CallEntry, Chat, ChatTheme, User } from "../../types";

const chatEmojis = ["😀", "😂", "🥰", "😍", "😊", "😎", "😭", "🤔", "👍", "👏", "🙌", "🙏", "❤️", "🔥", "🎉", "💯"];

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function endedTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
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

export function ConversationPanel({ user, chat, chats, calls, theme, showPresenceStatus, draft, setDraft, isTyping, onTypingChange, onCall, onSend, onBack, onPollVote, onEventRsvp, onShareFiles, onShareLocation, onCreatePoll, onCreateEvent, onShareContact, onThemeChange }: {
  user: User;
  chat: Chat;
  chats: Chat[];
  calls: CallEntry[];
  theme: ChatTheme;
  showPresenceStatus: boolean;
  draft: string;
  setDraft: (value: string) => void;
  isTyping: boolean;
  onTypingChange: (recipientId: string, typing: boolean) => void;
  onCall: (contactId: string, kind: "voice" | "video") => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onPollVote: (pollId: number, optionId: number) => void;
  onEventRsvp: (eventId: number, response: "going" | "interested" | "not_going") => void;
  onShareFiles: (files: File[]) => Promise<void>;
  onShareLocation: (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onCreateEvent: (event: { title: string; startsAt: string; place: string; description: string }) => Promise<void>;
  onShareContact: (contactId: string) => Promise<void>;
  onThemeChange: (theme: ChatTheme) => Promise<void>;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const previousChatId = useRef(chat.id);
  const followLatestMessage = useRef(true);
  const bubbleTheme = chatBubbleThemes.find((option) => option.id === theme.bubble) ?? chatBubbleThemes[0];
  const wallpaperTheme = chatWallpaperThemes.find((option) => option.id === theme.wallpaper);
  const themeStyle = {
    "--chat-bubble-mine": bubbleTheme.mine,
    "--chat-bubble-mine-text": bubbleTheme.mineText,
    "--chat-bubble-theirs": bubbleTheme.theirs,
    "--chat-bubble-theirs-text": bubbleTheme.theirsText,
    ...(wallpaperTheme ? { "--chat-wallpaper-background": wallpaperTheme.background } : {}),
  } as CSSProperties;
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
  const peerLastReadMessageId = chat.peerLastReadMessageId ?? 0;
  const seenMessageId = peerLastReadMessageId > 0
    ? chat.messages.reduce((latestId, message) => message.author === "me" && message.id <= peerLastReadMessageId ? message.id : latestId, 0)
    : 0;

  useLayoutEffect(() => {
    if (previousChatId.current !== chat.id) {
      previousChatId.current = chat.id;
      followLatestMessage.current = true;
      setChatMenuOpen(false);
      setThemePickerOpen(false);
    }

    const messageArea = messageAreaRef.current;
    if (messageArea && followLatestMessage.current) messageArea.scrollTop = messageArea.scrollHeight;
  });

  const stopTyping = () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTypingChange(chat.id, false);
    }
  };
  const updateDraft = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingChange(chat.id, true);
    }
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(stopTyping, 1400);
  };
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    stopTyping();
    setEmojiOpen(false);
    onSend(event);
  };

  useEffect(() => () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (typingActiveRef.current) onTypingChange(chat.id, false);
    typingActiveRef.current = false;
  }, [chat.id, onTypingChange]);

  return <section
    className={`conversation-panel chat-theme-bubble-${theme.bubble} chat-theme-wallpaper-${theme.wallpaper}`}
    style={themeStyle}
    aria-label={`Conversation with ${chat.name}`}
    onClick={(event) => {
      if (emojiOpen && !(event.target instanceof Element && event.target.closest(".composer-wrap"))) setEmojiOpen(false);
    }}
    onKeyDown={(event) => {
      if (emojiOpen && event.key === "Escape") {
        setEmojiOpen(false);
        emojiButtonRef.current?.focus();
      }
    }}
    onTouchStart={(event) => {
      const touch = event.changedTouches[0];
      const target = event.target;
      touchStart.current = touch.clientX <= 28 && !(target instanceof Element && target.closest("button, input, textarea, select, a, video"))
        ? { x: touch.clientX, y: touch.clientY }
        : null;
    }}
    onTouchEnd={(event) => {
      const start = touchStart.current;
      touchStart.current = null;
      const touch = event.changedTouches[0];
      if (start && touch.clientX - start.x > 90 && Math.abs(touch.clientY - start.y) < 70) onBack();
    }}
    onTouchCancel={() => { touchStart.current = null; }}
  >
    <div className="conversation-head">
      <button className="mobile-back icon-button" aria-label="Back to chats" onClick={onBack}><Icon name="back" /></button>
      <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={showPresenceStatus && Boolean(chat.online)} className="conversation-avatar" />
      <div className="conversation-contact-info">
        <strong title={chat.name}>{chat.name}</strong>
        {showPresenceStatus && <span className={`conversation-presence-label${chat.online ? " is-online" : " is-offline"}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="presence-indicator" aria-hidden="true" />
          {chat.online ? "Online" : "Offline"}
        </span>}
      </div>
      <div className="conversation-actions">
        <button className="icon-button conversation-call-action" type="button" aria-label={`Start audio call with ${chat.name}`} title={`Start audio call with ${chat.name}`} onClick={() => onCall(chat.id, "voice")}><Icon name="call" size={18} /></button>
        <button className="icon-button conversation-call-action conversation-video-action" type="button" aria-label={`Start video call with ${chat.name}`} title={`Start video call with ${chat.name}`} onClick={() => onCall(chat.id, "video")}><Icon name="video" size={18} /></button>
        <div className="chat-more-wrap">
          <button className="icon-button subtle-action more-contact" aria-label="Chat theme options" aria-expanded={chatMenuOpen} onClick={() => setChatMenuOpen((open) => !open)}><Icon name="moreVertical" /></button>
          {chatMenuOpen && <div className="chat-more-menu">
            <button type="button" onClick={() => { setChatMenuOpen(false); setThemePickerOpen(true); }}><Icon name="palette" size={16} /> Chat theme</button>
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
          {item.message.author === "them" && <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} className="message-avatar" />}
          <div className={`message-bubble ${item.message.author === "me" ? "mine-bubble" : "their-bubble"}`}>
            {item.message.text && <p>{item.message.text}</p>}
            <MessageContent message={item.message} onPollVote={onPollVote} onEventRsvp={onEventRsvp} />
            <span className="message-time">{item.message.time}{item.message.author === "me" && <Icon name="check" size={13} />}</span>
            {item.message.id === seenMessageId && <span className="message-seen" title={chat.peerLastReadAt ? `Seen by ${chat.name} at ${new Date(chat.peerLastReadAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `Seen by ${chat.name}`} aria-label={`Seen by ${chat.name}`}>Seen</span>}
          </div>
          {item.message.author === "me" && <Avatar initials={initials(user.name)} bg="#e2f3e8" fg="#159b62" className="message-avatar own-message-avatar" />}
        </div>
        : <button
          key={item.key}
          type="button"
          className={`call-history-event call-history-${item.call.status}`}
          onClick={() => onCall(chat.id, item.call.kind)}
          disabled={item.call.status === "active" || item.call.status === "ringing"}
          aria-label={`Call ${chat.name} by ${item.call.kind === "video" ? "video" : "audio"}`}
          title={`Call ${chat.name} by ${item.call.kind === "video" ? "video" : "audio"}`}
        >
          <span className={`call-history-icon status-${item.call.status}`} title={`${item.call.kind === "video" ? "Video" : "Audio"} call ${item.phase === "started" ? "started" : callOutcome(item.call)} · ${item.phase === "ended" ? endedTime(item.timestamp) : item.call.time}`}><Icon name={item.call.kind === "video" ? "video" : "call"} size={17} /></span>
          <span className="call-history-copy">
            <strong>{item.call.kind === "video" ? "Video" : "Audio"} call {item.phase === "started" ? "started" : callOutcome(item.call)}</strong>
            <small>{item.phase === "ended" && item.call.status === "completed" ? `Duration ${durationLabel(item.call.durationSeconds)} · ` : ""}{item.phase === "ended" ? endedTime(item.timestamp) : item.call.time}</small>
          </span>
        </button>)}
      {isTyping && <div className="message-row theirs typing-row">
        <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} className="message-avatar" />
        <div className="typing-bubble" role="status" aria-label={`${chat.name} is typing`}>
          <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span>Typing…</span>
        </div>
      </div>}
    </div>
    <div className="composer-wrap" onBlur={(event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setEmojiOpen(false);
    }}>
      {emojiOpen && <div className="emoji-picker" role="group" aria-label="Choose an emoji" onKeyDown={(event) => {
        if (event.key === "Escape") {
          setEmojiOpen(false);
          emojiButtonRef.current?.focus();
        }
      }}>
        {chatEmojis.map((emoji) => <button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => {
          updateDraft(`${draft}${draft ? " " : ""}${emoji}`);
          emojiButtonRef.current?.focus();
        }}>{emoji}</button>)}
      </div>}
      <form className="composer" onSubmit={submitMessage}>
        <button type="button" className="composer-tool" aria-label="Open message tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen(true)}><Icon name="attach" /></button>
        <input value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={`Message ${chat.name.split(" ")[0]}...`} aria-label="Write a message" />
        <button ref={emojiButtonRef} type="button" className="composer-tool emoji-tool" aria-label="Choose an emoji" aria-haspopup="true" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)}><Icon name="smile" /></button>
        <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}><Icon name="send" size={19} /></button>
      </form>
    </div>
    {toolsOpen && <ChatToolsSheet
      contacts={chats}
      onClose={() => setToolsOpen(false)}
      onFile={onShareFiles}
      onLocation={onShareLocation}
      onPoll={onCreatePoll}
      onEvent={onCreateEvent}
      onContact={onShareContact}
    />}
    {themePickerOpen && <ChatThemePicker theme={theme} onChange={onThemeChange} onClose={() => setThemePickerOpen(false)} />}
  </section>;
}
