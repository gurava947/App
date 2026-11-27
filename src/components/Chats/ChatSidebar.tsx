import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Chat } from "../../types";

function ChatItem({ chat, selected, typing, showPresenceStatus, menuOpen, onSelect, onToggleMenu, onCloseMenu, onDeleteChat }: {
  chat: Chat;
  selected: boolean;
  typing: boolean;
  showPresenceStatus: boolean;
  menuOpen: boolean;
  onSelect: (chat: Chat) => void;
  onToggleMenu: (chatId: string) => void;
  onCloseMenu: () => void;
  onDeleteChat: (chat: Chat) => void;
}) {
  const timer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const longPressTriggered = useRef(false);
  const stopLongPress = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopLongPress, []);

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      longPressTriggered.current = false;
      return;
    }
    pointerStart.current = { x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    longPressTriggered.current = false;
    stopLongPress();
    timer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      suppressClick.current = true;
      onToggleMenu(chat.id);
    }, 550);
  };
  const movePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
      stopLongPress();
      pointerStart.current = null;
    }
  };
  const endPointer = () => {
    stopLongPress();
    pointerStart.current = null;
  };
  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (longPressTriggered.current) return;
    if (pointerStart.current) {
      endPointer();
      longPressTriggered.current = true;
      suppressClick.current = true;
    }
    onToggleMenu(chat.id);
  };
  const selectChat = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onCloseMenu();
    onSelect(chat);
  };

  return <div className={`chat-item-container${menuOpen ? " is-menu-open" : ""}`} data-chat-item-id={chat.id} onContextMenu={openContextMenu}>
    <button
      className={`chat-item${selected ? " selected" : ""}`}
      type="button"
      onClick={selectChat}
      onPointerDown={startLongPress}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
    >
      <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={showPresenceStatus && Boolean(chat.online)} />
      <span className="chat-copy">
        <span className="chat-topline"><strong>{chat.name}</strong></span>
        <span className="chat-bottomline"><span className={`chat-preview${typing ? " typing-preview" : ""}`}>{typing ? "Typing…" : chat.preview}</span>{chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}</span>
        {chat.time && <time className="chat-time">{chat.time}</time>}
      </span>
    </button>
    <button className="chat-item-options" type="button" aria-label={`Conversation options for ${chat.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => onToggleMenu(chat.id)}>
      <Icon name="moreVertical" size={18} />
    </button>
    {menuOpen && <div className="chat-item-menu" role="menu" aria-label={`${chat.name} conversation options`}>
      <button type="button" role="menuitem" onClick={() => { onCloseMenu(); onDeleteChat(chat); }}>
        <Icon name="delete" size={16} /><span>Delete conversation</span>
      </button>
    </div>}
  </div>;
}

export function ChatSidebar({ chats, selectedId, search, setSearch, pendingRequestCount, typingUserIds, showPresenceStatus, onSelect, onNewMessage, onDeleteChat }: {
  chats: Chat[];
  selectedId: string;
  search: string;
  setSearch: (value: string) => void;
  pendingRequestCount: number;
  typingUserIds: ReadonlySet<string>;
  showPresenceStatus: boolean;
  onSelect: (chat: Chat) => void;
  onNewMessage: () => void;
  onDeleteChat: (chat: Chat) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest(".chat-item-container")?.getAttribute("data-chat-item-id") !== openMenuId) {
        setOpenMenuId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  return <aside className="chat-sidebar">
    <div className="sidebar-heading">
      <h1>Messages</h1>
      <button className="icon-button new-chat-button" aria-label={`Find people and connection requests${pendingRequestCount ? `, ${pendingRequestCount} pending` : ""}`} onClick={onNewMessage}>
        <Icon name="plus" />{pendingRequestCount > 0 && <span className="request-count-badge">{pendingRequestCount}</span>}
      </button>
    </div>
    <label className="search-box"><Icon name="search" size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search chats by person or message" />{search && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => setSearch("")}><Icon name="close" size={16} /></button>}</label>
    <div className="list-caption"><span>RECENT</span></div>
    <div className="chat-list">
      {chats.map((chat) => <ChatItem
        key={chat.id}
        chat={chat}
        selected={selectedId === chat.id}
        typing={typingUserIds.has(chat.id)}
        showPresenceStatus={showPresenceStatus}
        menuOpen={openMenuId === chat.id}
        onSelect={onSelect}
        onToggleMenu={(chatId) => setOpenMenuId((current) => current === chatId ? null : chatId)}
        onCloseMenu={() => setOpenMenuId(null)}
        onDeleteChat={onDeleteChat}
      />)}
    </div>
  </aside>;
}
