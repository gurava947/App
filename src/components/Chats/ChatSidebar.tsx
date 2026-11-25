import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Chat, UserNote } from "../../types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function ChatSidebar({ chats, notes, selectedId, search, setSearch, pendingRequestCount, onSelect, onNewMessage, onOpenNotes }: {
  chats: Chat[];
  notes: UserNote[];
  selectedId: string;
  search: string;
  setSearch: (value: string) => void;
  pendingRequestCount: number;
  onSelect: (chat: Chat) => void;
  onNewMessage: () => void;
  onOpenNotes: () => void;
}) {
  return <aside className="chat-sidebar">
    <div className="sidebar-heading">
      <div><div className="eyebrow">YOUR INBOX</div><h1>Messages<span className="heading-count">{chats.length.toString().padStart(2, "0")}</span></h1></div>
      <button className="icon-button new-chat-button" aria-label={`Find people and connection requests${pendingRequestCount ? `, ${pendingRequestCount} pending` : ""}`} onClick={onNewMessage}>
        <Icon name="plus" />{pendingRequestCount > 0 && <span className="request-count-badge">{pendingRequestCount}</span>}
      </button>
    </div>
    <label className="search-box"><Icon name="search" size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search chats by person or message" />{search && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => setSearch("")}><Icon name="close" size={16} /></button>}</label>
    <div className="sidebar-notes">
      <button type="button" className="sidebar-note-add" onClick={onOpenNotes}><span className="sidebar-note-add-icon"><Icon name="plus" size={16} /></span><strong>Your note</strong></button>
      {notes.slice(0, 4).map((note) => <button type="button" className="sidebar-note-item" key={note.id} title={`${note.authorName}: ${note.text}`} onClick={onOpenNotes}>
        <span className="sidebar-note-bubble"><Avatar initials={note.initials ?? initials(note.authorName)} bg="#e2f3e8" fg="#159b62" className="sidebar-note-avatar" /><span>{note.text}</span></span><strong>{note.authorName.split(/\s+/)[0]}</strong>
      </button>)}
      <button type="button" className="sidebar-notes-more" onClick={onOpenNotes}>Notes</button>
    </div>
    <div className="list-caption"><span>RECENT</span><span>{chats.length} chats</span></div>
    <div className="chat-list">
      {chats.map((chat) => <button key={chat.id} className={`chat-item${selectedId === chat.id ? " selected" : ""}`} onClick={() => onSelect(chat)}>
        <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={chat.online} />
        <span className="chat-copy"><span className="chat-topline"><strong>{chat.name}</strong><time>{chat.time}</time></span><span className="chat-bottomline"><span className="chat-preview">{chat.preview}</span>{chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}</span></span>
      </button>)}
      {chats.length === 0 && <div className="empty-search"><span className="empty-search-icon"><Icon name="user" size={20} /></span><strong>No conversations yet</strong><span>Send a connection request. Chat opens after they accept.</span></div>}
    </div>
    <div className="sidebar-foot"><span className="encryption-icon"><Icon name="lock" size={14} /></span> Local demo · not end-to-end encrypted</div>
  </aside>;
}
