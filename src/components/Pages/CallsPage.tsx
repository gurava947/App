import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { CallEntry } from "../../types";

function CallRow({ entry, onCall }: { entry: CallEntry; onCall: (contactId: string, kind: "voice" | "video") => void }) {
  const icon = entry.kind === "video" ? "video" : entry.direction === "incoming" ? "call" : "phone-out";
  const duration = entry.durationSeconds > 0
    ? ` · ${Math.floor(entry.durationSeconds / 60)}:${String(entry.durationSeconds % 60).padStart(2, "0")}`
    : "";
  const detail = `${entry.direction === "incoming" ? "Incoming" : "Outgoing"} ${entry.kind} · ${entry.status}${duration} · ${entry.time}`;
  const statusClass = entry.status === "missed" ? "call-row-missed" : entry.status === "completed" ? "call-row-completed" : "";
  return <article className={`call-row ${statusClass}`}>
    <Avatar initials={entry.initials} bg={entry.bg} fg={entry.fg} />
    <span className="call-copy"><strong>{entry.name}</strong><small><button className={`call-history-redial call-history-${entry.status}`} type="button" aria-label={`Redial ${entry.kind} call with ${entry.name}`} onClick={() => onCall(entry.contactId, entry.kind)}><span className={`call-type status-${entry.status}`} title={detail}><Icon name={icon} size={14} /></span>{detail}</button></small></span>
    <span className="call-actions">
      <button className="icon-button call-action" type="button" aria-label={`Start audio call with ${entry.name}`} title={`Start audio call with ${entry.name}`} onClick={() => onCall(entry.contactId, "voice")}><Icon name="call" size={19} /></button>
      <button className="icon-button call-action video-call-action" type="button" aria-label={`Start video call with ${entry.name}`} title={`Start video call with ${entry.name}`} onClick={() => onCall(entry.contactId, "video")}><Icon name="video" size={19} /></button>
    </span>
  </article>;
}

export function CallsPage({ calls, onCall }: { calls: CallEntry[]; onCall: (contactId: string, kind: "voice" | "video") => void }) {
  return <section className="page-section calls-page">
    <div className="calls-toolbar"><h1>Recent calls</h1></div>
    <div className="call-list">
      {calls.map((entry) => <CallRow key={entry.id} entry={entry} onCall={onCall} />)}
    </div>
  </section>;
}
