import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Chat } from "../../types";

export function ChatSidebar({ chats, selectedId, search, setSearch, pendingRequestCount, typingUserIds, showPresenceStatus, onSelect, onNewMessage }: {
  chats: Chat[];
  selectedId: string;
  search: string;
  setSearch: (value: string) => void;
  pendingRequestCount: number;
  typingUserIds: ReadonlySet<string>;
  showPresenceStatus: boolean;
  onSelect: (chat: Chat) => void;
  onNewMessage: () => void;
}) {
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
      {chats.map((chat) => {
        const typing = typingUserIds.has(chat.id);
        return <button key={chat.id} className={`chat-item${selectedId === chat.id ? " selected" : ""}`} onClick={() => onSelect(chat)}>
        <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={showPresenceStatus && Boolean(chat.online)} />
          <span className="chat-copy">
            <span className="chat-topline"><strong>{chat.name}</strong></span>
            <span className="chat-bottomline"><span className={`chat-preview${typing ? " typing-preview" : ""}`}>{typing ? "Typing…" : chat.preview}</span>{chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}</span>
            {chat.time && <time className="chat-time">{chat.time}</time>}
          </span>
        </button>;
      })}
    </div>
  </aside>;
}
