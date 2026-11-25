import { useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { CallEntry, Chat } from "../../types";

function CallRow({ entry, onCall }: { entry: CallEntry; onCall: (contactId: string, kind: "voice" | "video") => void }) {
  const icon = entry.kind === "video" ? "video" : entry.direction === "incoming" ? "call" : "phone-out";
  const duration = entry.durationSeconds > 0
    ? ` · ${Math.floor(entry.durationSeconds / 60)}:${String(entry.durationSeconds % 60).padStart(2, "0")}`
    : "";
  const detail = `${entry.direction === "incoming" ? "Incoming" : "Outgoing"} ${entry.kind} · ${entry.status}${duration} · ${entry.time}`;
  return <div className="call-row">
    <Avatar initials={entry.initials} bg={entry.bg} fg={entry.fg} />
    <span className="call-copy"><strong>{entry.name}</strong><small><Icon name={icon} size={14} className={`call-type ${entry.direction}`} />{detail}</small></span>
    <span className="call-actions">
      <button className="icon-button call-action" aria-label={`Audio call ${entry.name}`} title={`Audio call ${entry.name}`} onClick={() => onCall(entry.contactId, "voice")}><Icon name="call" size={19} /></button>
      <button className="icon-button call-action video-call-action" aria-label={`Video call ${entry.name}`} title={`Video call ${entry.name}`} onClick={() => onCall(entry.contactId, "video")}><Icon name="video" size={19} /></button>
    </span>
  </div>;
}

export function CallsPage({ calls, chats, onCall }: { calls: CallEntry[]; chats: Chat[]; onCall: (contactId: string, kind: "voice" | "video") => void }) {
  const [selectedContact, setSelectedContact] = useState(chats[0]?.id ?? "");
  const contactStillAvailable = chats.some((chat) => chat.id === selectedContact);
  const activeContact = contactStillAvailable ? selectedContact : chats[0]?.id ?? "";

  return <section className="page-section">
    <div className="page-intro"><div><div className="eyebrow">STAY CLOSE</div><h1>Calls</h1><p>Shared call history for your connected accounts.</p></div><div className="new-call-control">
      <select aria-label="Choose who to call" value={activeContact} onChange={(event) => setSelectedContact(event.target.value)} disabled={chats.length === 0}>
        {chats.length === 0 && <option value="">No connected accounts</option>}
        {chats.map((chat) => <option key={chat.id} value={chat.id}>{chat.name}</option>)}
      </select>
      <button className="primary-button" disabled={!activeContact} onClick={() => onCall(activeContact, "voice")}><Icon name="call" size={17} /> New call</button>
    </div></div>
    <div className="call-section-title"><h2>Recent calls</h2><span>{calls.length} saved</span></div>
    <div className="surface-card call-list">
      {calls.map((entry) => <CallRow key={entry.id} entry={entry} onCall={onCall} />)}
      {calls.length === 0 && <div className="empty-call-history"><strong>No call history yet</strong><span>Calls you start with connected accounts will be saved here.</span></div>}
    </div>
    <div className="calls-tip"><span className="tip-icon"><Icon name="call" size={18} /></span><span><strong>Call history syncs between your apps.</strong><small>Audio and video use a direct peer-to-peer connection between active localhost sessions.</small></span></div>
  </section>;
}
