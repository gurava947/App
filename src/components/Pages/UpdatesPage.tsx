import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { StoryUpdate, User, UserNote } from "../../types";
import "./Features.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formattedExpiry(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `Expires ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function UpdatesPage({ user, updates, notes, onAddUpdate, onCreateNote, onDeleteUpdate, onDeleteNote, notify }: {
  user: User;
  updates: StoryUpdate[];
  notes: UserNote[];
  onAddUpdate: (file: File, caption: string) => Promise<void>;
  onCreateNote: (text: string) => Promise<void>;
  onDeleteUpdate: (updateId: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storyAuthor, setStoryAuthor] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const storyGroups = useMemo(() => {
    const groups = new Map<string, StoryUpdate[]>();
    for (const update of updates) {
      if (Date.parse(update.expiresAt) <= Date.now()) continue;
      const current = groups.get(update.authorId) ?? [];
      current.push(update);
      groups.set(update.authorId, current);
    }
    return [...groups.entries()].map(([authorId, items]) => ({ authorId, items, authorName: items[0].authorName, initials: items[0].initials ?? initials(items[0].authorName) }));
  }, [updates]);
  const activeGroup = storyGroups.find((group) => group.authorId === storyAuthor);
  const activeStory = activeGroup?.items[storyIndex];

  const submitUpdate = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    void onAddUpdate(file, caption.trim()).then(() => {
      setComposerOpen(false);
      setCaption("");
      notify("Update shared.");
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not share this update.")).finally(() => setBusy(false));
  };
  const selectUpdateFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    submitUpdate(file);
  };
  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      await onCreateNote(text);
      setNoteText("");
      setNoteOpen(false);
      notify("Note shared for 24 hours.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not share this note.");
    } finally {
      setBusy(false);
    }
  };
  const advanceStory = (step: number) => {
    if (!activeGroup) return;
    const next = storyIndex + step;
    if (next >= activeGroup.items.length) {
      const nextGroupIndex = storyGroups.findIndex((group) => group.authorId === activeGroup.authorId) + 1;
      if (nextGroupIndex >= storyGroups.length) setStoryAuthor(null);
      else { setStoryAuthor(storyGroups[nextGroupIndex].authorId); setStoryIndex(0); }
      return;
    }
    if (next < 0) {
      const previousGroupIndex = storyGroups.findIndex((group) => group.authorId === activeGroup.authorId) - 1;
      if (previousGroupIndex < 0) { setStoryIndex(0); return; }
      const previous = storyGroups[previousGroupIndex];
      setStoryAuthor(previous.authorId);
      setStoryIndex(previous.items.length - 1);
      return;
    }
    setStoryIndex(next);
  };

  return <section className="page-section updates-page">
    <div className="page-intro"><div><div className="eyebrow">LITTLE MOMENTS</div><h1>Updates</h1><p>Share a story or a short note with your connected people.</p></div>
      <div className="feed-create-actions"><button className="secondary-button" type="button" onClick={() => setNoteOpen(true)}><Icon name="edit" size={17} /> Add note</button><button className="primary-button" type="button" onClick={() => { setError(""); setComposerOpen(true); }}><Icon name="plus" size={18} /> Add update</button></div>
    </div>

    <div className="surface-card statuses-card">
      <div className="section-label"><div><h2>Recent updates</h2><p>Stories expire automatically after 24 hours.</p></div></div>
      <div className="status-list">
        <button className="status-card add-status" type="button" onClick={() => { setError(""); setComposerOpen(true); }}>
          <span className="status-ring own-ring"><Avatar initials={initials(user.name)} bg="#e9f7ef" fg="#159b62" className="status-avatar" /></span>
          <span className="status-plus"><Icon name="plus" size={14} /></span><strong>Your update</strong><small>Share a moment</small>
        </button>
        {storyGroups.map((group) => <button className="status-card" type="button" key={group.authorId} onClick={() => { setStoryAuthor(group.authorId); setStoryIndex(0); }}>
          <span className={`status-ring${group.authorId === user.id ? " own-ring" : ""}`}><Avatar initials={group.initials} bg="#e2f3e8" fg="#159b62" className="status-avatar" /></span>
          <strong>{group.authorId === user.id ? "Your story" : group.authorName}</strong><small>{group.items.length} update{group.items.length === 1 ? "" : "s"}</small>
        </button>)}
      </div>
      {storyGroups.length === 0 && <div className="updates-empty"><strong>No recent updates</strong><span>When you or your connections post a story, it will appear here.</span></div>}
    </div>

    <div className="surface-card notes-card">
      <div className="section-label"><div><h2>Notes</h2><p>Short thoughts that disappear after 24 hours.</p></div><button className="text-button" type="button" onClick={() => setNoteOpen(true)}>Write a note</button></div>
      <div className="notes-list">
        {notes.map((note) => <article className={`note-card${note.authorId === user.id ? " own-note" : ""}`} key={note.id}>
          <Avatar initials={note.initials ?? initials(note.authorName)} bg="#e2f3e8" fg="#159b62" className="note-avatar" />
          <span className="note-bubble"><strong>{note.authorId === user.id ? "You" : note.authorName}</strong><span>{note.text}</span><small>{formattedExpiry(note.expiresAt)}</small>{note.authorId === user.id && <button className="delete-note-button" type="button" aria-label="Delete your note" onClick={() => { if (window.confirm("Delete this note?")) void onDeleteNote(note.id).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : "Could not delete this note.")); }}><Icon name="delete" size={14} /></button>}</span>
        </article>)}
        {notes.length === 0 && <div className="notes-empty">No active notes yet. Add one to start a conversation.</div>}
      </div>
    </div>

    <input ref={fileInput} className="visually-hidden" type="file" accept="image/*,video/*" onChange={selectUpdateFile} aria-label="Choose a story photo or video" />

    {composerOpen && <div className="feed-modal-backdrop" onClick={() => !busy && setComposerOpen(false)}>
      <form className="feed-composer-modal" role="dialog" aria-modal="true" aria-labelledby="update-composer-title" onSubmit={(event) => { event.preventDefault(); fileInput.current?.click(); }} onClick={(event) => event.stopPropagation()}>
        <div className="feed-modal-heading"><div><div className="eyebrow">24-HOUR STORY</div><h2 id="update-composer-title">Share an update</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="Close update composer" onClick={() => setComposerOpen(false)}><Icon name="close" /></button></div>
        <label className="feed-caption-label">Caption<input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={300} placeholder="Add a short caption (optional)" /></label>
        {error && <p className="feed-error" role="alert">{error}</p>}
        <div className="feed-modal-actions"><button type="button" disabled={busy} onClick={() => setComposerOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Uploading…" : "Choose photo or video"}</button></div>
        <p className="feed-provider-note">Stories are visible to your connected INChat accounts. No “viewed by” list is shown.</p>
      </form>
    </div>}

    {noteOpen && <div className="feed-modal-backdrop" onClick={() => !busy && setNoteOpen(false)}>
      <form className="feed-composer-modal" role="dialog" aria-modal="true" aria-labelledby="note-composer-title" onSubmit={submitNote} onClick={(event) => event.stopPropagation()}>
        <div className="feed-modal-heading"><div><div className="eyebrow">24-HOUR NOTE</div><h2 id="note-composer-title">Share a note</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="Close note composer" onClick={() => setNoteOpen(false)}><Icon name="close" /></button></div>
        <label className="feed-caption-label">Your note<textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={120} rows={3} required placeholder="What’s on your mind?" /></label>
        {error && <p className="feed-error" role="alert">{error}</p>}
        <div className="feed-modal-actions"><button type="button" disabled={busy} onClick={() => setNoteOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !noteText.trim()}>{busy ? "Sharing…" : "Share note"}</button></div>
      </form>
    </div>}

    {activeStory && <div className="story-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`${activeGroup?.authorName}'s story`} onClick={() => setStoryAuthor(null)}>
      <div className="story-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="story-progress"><span style={{ width: `${((storyIndex + 1) / (activeGroup?.items.length ?? 1)) * 100}%` }} /></div>
        <div className="story-viewer-header"><Avatar initials={activeStory.initials ?? initials(activeStory.authorName)} bg="#e2f3e8" fg="#159b62" className="mini-avatar" /><strong>{activeStory.authorName}</strong><small>{formattedExpiry(activeStory.expiresAt)}</small>{activeStory.authorId === user.id && <button type="button" aria-label="Delete this update" onClick={() => { if (window.confirm("Delete this update and its media?")) void onDeleteUpdate(activeStory.id).then(() => setStoryAuthor(null)).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : "Could not delete this update.")); }}><Icon name="delete" size={16} /></button>}<button type="button" aria-label="Close story" onClick={() => setStoryAuthor(null)}><Icon name="close" /></button></div>
        <div className="story-media">
          {activeStory.media?.mimeType.startsWith("video/") && <video src={activeStory.media.url} controls autoPlay playsInline />}
          {activeStory.media?.mimeType.startsWith("image/") && <img src={activeStory.media.url} alt={activeStory.caption || `${activeStory.authorName}'s update`} />}
          {activeStory.caption && <p>{activeStory.caption}</p>}
        </div>
        <button className="story-previous" type="button" aria-label="Previous update" onClick={() => advanceStory(-1)}>‹</button>
        <button className="story-next" type="button" aria-label="Next update" onClick={() => advanceStory(1)}>›</button>
      </div>
    </div>}
  </section>;
}
