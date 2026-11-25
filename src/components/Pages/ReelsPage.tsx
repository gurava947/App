import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { FeedComment, FeedPost } from "../../types";
import "./Features.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function authorAction(post: FeedPost, userId: string) {
  if (post.authorId === userId || post.connectionStatus === "connected") return null;
  if (post.connectionStatus === "outgoing") return "Requested";
  if (post.connectionStatus === "incoming") return "Request received";
  return "Connect";
}

function FeedCard({ post, userId, onLike, onSave, onRepost, onOpenComments, onConnect, onDelete }: {
  post: FeedPost;
  userId: string;
  onLike: (id: string, active: boolean) => void;
  onSave: (id: string, active: boolean) => void;
  onRepost: (id: string, active: boolean) => void;
  onOpenComments: (post: FeedPost) => void;
  onConnect: (authorId: string) => void;
  onDelete: (postId: string) => void;
}) {
  const action = authorAction(post, userId);
  return <article className={`feed-post-card${post.kind === "reel" ? " is-reel" : " is-post"}`}>
    <header className="feed-post-header">
      <Avatar initials={initials(post.authorName)} bg="#e2f3e8" fg="#159b62" />
      <span className="feed-post-author"><strong>{post.authorName}</strong><small>{new Date(post.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></span>
      {action && <button className={`feed-connect-button${action !== "Connect" ? " is-pending" : ""}`} type="button" disabled={action !== "Connect"} onClick={() => onConnect(post.authorId)}>{action}</button>}
      <span className="feed-type-pill">{post.kind === "reel" ? "REEL" : "POST"}</span>
      {post.authorId === userId && <button className="feed-delete-button" type="button" aria-label="Delete your post" onClick={() => onDelete(post.id)}><Icon name="delete" size={18} /></button>}
    </header>
    <div className="feed-post-body">
      {post.media?.mimeType.startsWith("video/") && <video className="feed-post-media" src={post.media.url} controls playsInline preload="metadata" aria-label={`${post.authorName}'s ${post.kind}`} />}
      {post.media?.mimeType.startsWith("image/") && <img className="feed-post-media" src={post.media.url} alt={post.caption || `${post.authorName}'s post`} loading="lazy" />}
      {post.caption && <p className="feed-post-caption">{post.caption}</p>}
      {!post.media && post.kind === "post" && <div className="feed-text-post">{post.caption}</div>}
    </div>
    <div className="feed-post-actions">
      <button type="button" className={post.liked ? "is-liked" : ""} aria-pressed={post.liked} onClick={() => onLike(post.id, !post.liked)}><Icon name="heart" size={20} /><span>{post.likeCount}</span></button>
      <button type="button" onClick={() => onOpenComments(post)}><Icon name="chat" size={20} /><span>{post.commentCount}</span></button>
      <button type="button" className={post.reposted ? "is-selected" : ""} aria-pressed={post.reposted} onClick={() => onRepost(post.id, !post.reposted)}><Icon name="repost" size={20} /><span>{post.repostCount || "Repost"}</span></button>
      <button type="button" className={post.saved ? "is-selected" : ""} aria-pressed={post.saved} onClick={() => onSave(post.id, !post.saved)} aria-label={post.saved ? "Unsave post" : "Save post"}><Icon name="bookmark" size={20} /></button>
    </div>
  </article>;
}

export function ReelsPage({ feed, userId, onCreatePost, onLike, onSave, onRepost, onComment, onLoadComments, onConnect, onDeletePost, notify }: {
  feed: FeedPost[];
  userId: string;
  onCreatePost: (kind: "post" | "reel", file: File | null, caption: string) => Promise<void>;
  onLike: (id: string, active: boolean) => Promise<void>;
  onSave: (id: string, active: boolean) => Promise<void>;
  onRepost: (id: string, active: boolean) => Promise<void>;
  onComment: (id: string, text: string) => Promise<FeedComment>;
  onLoadComments: (id: string) => Promise<FeedComment[]>;
  onConnect: (authorId: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [composerKind, setComposerKind] = useState<"post" | "reel" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeComments, setActiveComments] = useState<FeedPost | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState("");

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    try {
      await action();
      if (successMessage) notify(successMessage);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "The action could not be completed.");
    }
  };
  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!composerKind) return;
    if (composerKind === "reel" && (!file || !file.type.startsWith("video/"))) {
      setError("Choose a video to create a reel.");
      return;
    }
    if (composerKind === "post" && !file && !caption.trim()) {
      setError("Add text or choose a photo or video.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreatePost(composerKind, file, caption.trim());
      setComposerKind(null);
      setFile(null);
      setCaption("");
      notify(composerKind === "reel" ? "Reel shared." : "Post shared.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish this post.");
    } finally {
      setBusy(false);
    }
  };
  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeComments || !commentDraft.trim()) return;
    setCommentBusy(true);
    try {
      const newComment = await onComment(activeComments.id, commentDraft.trim());
      setCommentDraft("");
      setActiveComments((current) => current ? { ...current, commentCount: current.commentCount + 1, comments: [...(current.comments ?? []), newComment] } : current);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not add your comment.");
    } finally {
      setCommentBusy(false);
    }
  };
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  };
  const openComments = async (post: FeedPost) => {
    setActiveComments({ ...post, comments: [] });
    setCommentsLoading(true);
    try {
      const comments = await onLoadComments(post.id);
      setActiveComments((current) => current?.id === post.id ? { ...current, comments } : current);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not load comments.");
    } finally {
      setCommentsLoading(false);
    }
  };

  return <section className="page-section feed-page">
    <div className="page-intro"><div><div className="eyebrow">DISCOVER & SHARE</div><h1>Reels & posts</h1><p>Real posts from INChat accounts. Likes, comments and saves sync between both apps.</p></div>
      <div className="feed-create-actions"><button className="secondary-button" type="button" onClick={() => { setComposerKind("post"); setError(""); }}><Icon name="edit" size={17} /> New post</button><button className="primary-button" type="button" onClick={() => { setComposerKind("reel"); setError(""); }}><Icon name="movie" size={17} /> Create reel</button></div>
    </div>
    <div className="feed-layout">
      <div className="reels-feed" aria-label="Posts and reels">
        {feed.map((post) => <FeedCard key={post.id} post={post} userId={userId} onLike={(id, active) => void runAction(() => onLike(id, active))} onSave={(id, active) => void runAction(() => onSave(id, active))} onRepost={(id, active) => void runAction(() => onRepost(id, active))} onOpenComments={(postToOpen) => void openComments(postToOpen)} onConnect={(id) => void runAction(() => onConnect(id), "Connection request sent.")} onDelete={(id) => void runAction(() => onDeletePost(id))} />)}
        {feed.length === 0 && <div className="feed-empty surface-card"><span className="empty-search-icon"><Icon name="movie" size={22} /></span><strong>No posts or reels yet</strong><span>Share your first real post or reel. New content will appear here after it is saved.</span><button className="primary-button" type="button" onClick={() => setComposerKind("reel")}>Create a reel</button></div>}
      </div>
      <aside className="feed-privacy-card surface-card"><span className="setting-icon"><Icon name="lock" size={18} /></span><strong>Your connections stay in control</strong><p>Connect sends a request; it never creates an accepted connection by itself. AI generation and external map services stay unavailable until approved.</p></aside>
    </div>

    {composerKind && <div className="feed-modal-backdrop" onClick={() => !busy && setComposerKind(null)}>
      <form className="feed-composer-modal" role="dialog" aria-modal="true" aria-labelledby="feed-composer-title" onSubmit={submitPost} onClick={(event) => event.stopPropagation()}>
        <div className="feed-modal-heading"><div><div className="eyebrow">SHARE WITH INCHAT</div><h2 id="feed-composer-title">{composerKind === "reel" ? "Create a reel" : "Write a post"}</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="Close composer" onClick={() => setComposerKind(null)}><Icon name="close" /></button></div>
        <label className="feed-file-select"> {file ? `Selected: ${file.name}` : composerKind === "reel" ? "Choose a video" : "Add a photo or video (optional)"}
          <input type="file" accept={composerKind === "reel" ? "video/*" : "image/*,video/*"} required={composerKind === "reel"} onChange={selectFile} />
        </label>
        <label className="feed-caption-label">Caption<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1200} rows={4} placeholder="Write something for your people…" /></label>
        {error && <p className="feed-error" role="alert">{error}</p>}
        <div className="feed-modal-actions"><button type="button" disabled={busy} onClick={() => setComposerKind(null)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || (composerKind === "reel" && !file)}>{busy ? "Publishing…" : "Share"}</button></div>
        <p className="feed-provider-note">Your media is stored locally. No external AI or map service is contacted.</p>
      </form>
    </div>}

    {activeComments && <div className="feed-modal-backdrop" onClick={() => setActiveComments(null)}>
      <section className="feed-comments-modal" role="dialog" aria-modal="true" aria-labelledby="feed-comments-title" onClick={(event) => event.stopPropagation()}>
        <div className="feed-modal-heading"><div><div className="eyebrow">CONVERSATION</div><h2 id="feed-comments-title">Comments</h2></div><button type="button" className="icon-button" aria-label="Close comments" onClick={() => setActiveComments(null)}><Icon name="close" /></button></div>
        <p className="feed-comment-caption">{activeComments.caption || "Post conversation"}</p>
        <div className="feed-comments-list">
          {(activeComments.comments ?? []).map((comment) => <div className="feed-comment-row" key={comment.id}><Avatar initials={initials(comment.authorName)} bg="#e2f3e8" fg="#159b62" className="mini-avatar" /><span><strong>{comment.authorName}</strong><small>{comment.text}</small></span></div>)}
          {commentsLoading && <p className="feed-comments-empty">Loading comments…</p>}
          {!commentsLoading && (!activeComments.comments || activeComments.comments.length === 0) && <p className="feed-comments-empty">No comments yet. Start the conversation.</p>}
        </div>
        <form className="feed-comment-form" onSubmit={submitComment}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={500} placeholder="Write a comment…" aria-label="Write a comment" /><button className="send-button" type="submit" disabled={commentBusy || !commentDraft.trim()} aria-label="Send comment"><Icon name="send" size={17} /></button></form>
      </section>
    </div>}
  </section>;
}
