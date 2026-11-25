import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Message } from "../../types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function MessageContent({ message, onPollVote, onEventRsvp }: {
  message: Message;
  onPollVote: (pollId: number, optionId: number) => void;
  onEventRsvp: (eventId: number, response: "going" | "interested" | "not_going") => void;
}) {
  const payload = message.payload;
  if (!payload) return null;

  if (payload.kind === "media") return <div className="shared-media-list">
    {payload.files.map((file) => file.mimeType.startsWith("image/")
      ? <a href={file.url} target="_blank" rel="noreferrer" key={file.id} className="shared-media-image-link" aria-label={`Open ${file.name}`}>
        <img className="shared-media-image" src={file.url} alt={file.name} loading="lazy" />
        <span className="shared-media-name">{file.name}</span>
      </a>
      : file.mimeType.startsWith("video/")
        ? <video key={file.id} className="shared-media-video" controls preload="metadata" src={file.url} aria-label={file.name} />
        : <a className="shared-media-document" href={file.url} download={file.name} key={file.id}>
          <Icon name="attach" size={18} /><span><strong>{file.name}</strong><small>{Math.ceil(file.sizeBytes / 1024)} KB</small></span><Icon name="chevron" size={18} />
        </a>)}
  </div>;

  if (payload.kind === "contact") return <div className="shared-contact-card">
    {payload.contact
      ? <>
        <Avatar initials={initials(payload.contact.name)} bg="#e2f3e8" fg="#159b62" className="shared-contact-avatar" />
        <span><strong>{payload.contact.name}</strong><small>{payload.contact.email}</small></span>
      </>
      : <span><strong>Contact unavailable</strong><small>This shared contact can no longer be displayed.</small></span>}
  </div>;

  if (payload.kind === "location") {
    const coordinates = typeof payload.latitude === "number" && Number.isFinite(payload.latitude)
      && typeof payload.longitude === "number" && Number.isFinite(payload.longitude)
      ? `${payload.latitude.toFixed(5)}, ${payload.longitude.toFixed(5)}`
      : null;
    const accuracy = typeof payload.accuracy === "number" && Number.isFinite(payload.accuracy)
      ? ` · ±${Math.round(payload.accuracy)} m`
      : "";
    return <div className="shared-location-card">
      <span className="shared-location-icon"><Icon name="location" size={20} /></span>
      <span><strong>{payload.liveShareId ? "Live location" : "Current location"}</strong>
        <small>{coordinates !== null
          ? `${coordinates}${accuracy}`
          : payload.liveShareId ? "Location is no longer available" : "Coordinates unavailable"}</small>
        {payload.expiresAt && <small>{Date.parse(payload.expiresAt) > Date.now() ? `Sharing until ${formattedDate(payload.expiresAt)}` : "Location sharing ended"}</small>}
      </span>
    </div>;
  }

  if (payload.kind === "poll") return <div className="shared-poll-card">
    <div className="shared-poll-heading"><Icon name="poll" size={18} /><strong>{payload.poll.question}</strong></div>
    <div className="shared-poll-options">{payload.poll.options.map((option) => <button
      type="button"
      className={`shared-poll-option${option.selected ? " selected" : ""}`}
      key={option.id}
      onClick={() => onPollVote(payload.poll.id, option.id)}
      aria-pressed={option.selected}
      disabled={Boolean(payload.poll.expiresAt && Date.parse(payload.poll.expiresAt) <= Date.now())}
    ><span>{option.text}</span><small>{option.votes}</small></button>)}</div>
    <small className="shared-poll-total">{payload.poll.totalVotes} votes</small>
  </div>;

  if (payload.kind === "event") return <div className="shared-event-card">
    <div className="shared-event-heading"><span className="shared-event-icon"><Icon name="event" size={18} /></span><span><strong>{payload.event.title}</strong><small>{formattedDate(payload.event.startsAt)}</small></span></div>
    {payload.event.place && <p className="shared-event-place">{payload.event.place}</p>}
    {payload.event.description && <p className="shared-event-description">{payload.event.description}</p>}
    <div className="shared-event-actions">
      <button type="button" className={payload.event.myRsvp === "going" ? "selected" : ""} onClick={() => onEventRsvp(payload.event.id, "going")}>Going</button>
      <button type="button" className={payload.event.myRsvp === "interested" ? "selected" : ""} onClick={() => onEventRsvp(payload.event.id, "interested")}>Interested</button>
      <button type="button" className={payload.event.myRsvp === "not_going" ? "selected" : ""} onClick={() => onEventRsvp(payload.event.id, "not_going")}>Can't go</button>
      <span>{payload.event.rsvpCount} responses</span>
    </div>
  </div>;

  return null;
}
