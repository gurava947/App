import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Chat } from "../../types";

type ToolMode = "menu" | "poll" | "event" | "contact" | "location";

export function ChatToolsSheet({ contacts, onClose, onFile, onLocation, onPoll, onEvent, onContact }: {
  contacts: Chat[];
  onClose: () => void;
  onFile: (files: File[]) => Promise<void>;
  onLocation: (mode: "current" | "live", durationMinutes: 5 | 10 | 15) => Promise<void>;
  onPoll: (question: string, options: string[]) => Promise<void>;
  onEvent: (event: { title: string; startsAt: string; place: string; description: string }) => Promise<void>;
  onContact: (contactId: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<ToolMode>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [locationMinutes, setLocationMinutes] = useState<5 | 10 | 15>(15);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  const run = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The item could not be shared.");
    } finally {
      setBusy(false);
    }
  };
  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) void run(() => onFile(files));
  };
  const submitPoll = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!pollQuestion.trim() || options.length < 2) {
      setError("Enter a question and at least two poll options.");
      return;
    }
    void run(() => onPoll(pollQuestion.trim(), options));
  };
  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startsAt = new Date(eventStartsAt);
    if (!eventTitle.trim() || !eventStartsAt || !Number.isFinite(startsAt.getTime())) {
      setError("Enter an event name and a valid start time.");
      return;
    }
    void run(() => onEvent({
      title: eventTitle.trim(),
      startsAt: startsAt.toISOString(),
      place: eventPlace.trim(),
      description: eventDescription.trim(),
    }));
  };

  return <div className="chat-tools-backdrop" onClick={onClose}>
    <section className="chat-tools-sheet" role="dialog" aria-modal="true" aria-labelledby="chat-tools-title" onClick={(event) => event.stopPropagation()}>
      <div className="chat-tools-handle" />
      <header className="chat-tools-header">
        <div><div className="eyebrow">SHARE PRIVATELY</div><h2 id="chat-tools-title">{mode === "menu" ? "Message tools" : mode === "location" ? "Share location" : mode === "contact" ? "Share a contact" : mode === "poll" ? "Create a poll" : "Create an event"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close message tools" onClick={onClose}><Icon name="close" /></button>
      </header>

      {mode === "menu" && <>
        <div className="chat-tools-grid">
          <button type="button" onClick={() => galleryInput.current?.click()}><Icon name="image" /><span>Gallery</span></button>
          <button type="button" onClick={() => cameraInput.current?.click()}><Icon name="camera" /><span>Camera</span></button>
          <button type="button" onClick={() => setMode("location")}><Icon name="location" /><span>Location</span></button>
          <button type="button" onClick={() => setMode("contact")}><Icon name="contact" /><span>Contact</span></button>
          <button type="button" onClick={() => documentInput.current?.click()}><Icon name="document" /><span>Document</span></button>
          <button type="button" onClick={() => setMode("poll")}><Icon name="poll" /><span>Poll</span></button>
          <button type="button" onClick={() => setMode("event")}><Icon name="event" /><span>Event</span></button>
          <button type="button" disabled title="AI provider approval is required"><Icon name="ai" /><span>AI images</span><small>Approval required</small></button>
        </div>
        <p className="chat-tools-privacy">Files are stored on this device’s local INChat service. Maps and AI providers are not contacted.</p>
      </>}

      {mode === "location" && <div className="chat-tools-form">
        <div className="location-privacy-card"><Icon name="location" size={20} /><span><strong>Share coordinates only</strong><small>INChat will ask your browser for location permission. No map tiles or external location provider are used.</small></span></div>
        <label className="location-duration">Live share duration
          <select value={locationMinutes} onChange={(event) => {
            const value = Number(event.target.value);
            setLocationMinutes(value === 5 || value === 10 ? value : 15);
          }}>
            <option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option>
          </select>
        </label>
        <div className="chat-tools-actions"><button type="button" onClick={() => setMode("menu")}>Back</button>
          <button type="button" disabled={busy} onClick={() => void run(() => onLocation("current", locationMinutes))}>Send current location</button>
          <button type="button" disabled={busy} className="primary-button" onClick={() => void run(() => onLocation("live", locationMinutes))}>Start live location</button>
        </div>
      </div>}

      {mode === "contact" && <div className="chat-tools-contact-list">
        {contacts.map((contact) => <button type="button" key={contact.id} disabled={busy} onClick={() => void run(() => onContact(contact.id))}>
          <Avatar initials={contact.initials} bg={contact.bg} fg={contact.fg} />
          <span><strong>{contact.name}</strong><small>{contact.email}</small></span>
          <Icon name="chevron" size={18} />
        </button>)}
        {contacts.length === 0 && <p className="chat-tools-empty">No connected contacts are available to share.</p>}
      </div>}

      {mode === "poll" && <form className="chat-tools-form" onSubmit={submitPoll}>
        <label>Question<input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} maxLength={180} required /></label>
        <div className="poll-input-list">{pollOptions.map((option, index) => <label key={index}>Option {index + 1}
          <input value={option} maxLength={80} onChange={(event) => setPollOptions((current) => current.map((value, position) => position === index ? event.target.value : value))} />
        </label>)}</div>
        {pollOptions.length < 6 && <button className="text-button" type="button" onClick={() => setPollOptions((current) => [...current, ""])}>+ Add option</button>}
        <div className="chat-tools-actions"><button type="button" onClick={() => setMode("menu")}>Back</button><button type="submit" className="primary-button" disabled={busy}>Send poll</button></div>
      </form>}

      {mode === "event" && <form className="chat-tools-form" onSubmit={submitEvent}>
        <label>Event name<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={100} required /></label>
        <label>Starts at<input type="datetime-local" value={eventStartsAt} onChange={(event) => setEventStartsAt(event.target.value)} required /></label>
        <label>Place (optional)<input value={eventPlace} onChange={(event) => setEventPlace(event.target.value)} maxLength={160} /></label>
        <label>Description (optional)<textarea value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} maxLength={500} rows={2} /></label>
        <div className="chat-tools-actions"><button type="button" onClick={() => setMode("menu")}>Back</button><button type="submit" className="primary-button" disabled={busy}>Share event</button></div>
      </form>}

      {error && <p className="chat-tools-error" role="alert">{error}</p>}
      {busy && <p className="chat-tools-busy" role="status">Saving to local storage…</p>}
      <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={handleFiles} />
      <input ref={documentInput} type="file" accept=".pdf,.txt,.doc,.docx,.odt,.rtf,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={handleFiles} />
    </section>
  </div>;
}
