import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { Chat, FeedComment, FeedPost } from "../../types";
import "./Features.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatCount(count: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function authorAction(post: FeedPost, userId: string) {
  if (post.authorId === userId || post.connectionStatus === "connected") return null;
  if (post.connectionStatus === "outgoing") return "Requested";
  if (post.connectionStatus === "incoming") return "Request received";
  return "Connect";
}

function FeedCard({ post, userId, onLike, onSave, onRepost, onOpenComments, onShare, onConnect, onDelete, onOpenReel }: {
  post: FeedPost;
  userId: string;
  onLike: (id: string, active: boolean) => Promise<void>;
  onSave: (id: string, active: boolean) => void;
  onRepost: (id: string, active: boolean) => void;
  onOpenComments: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onConnect: (authorId: string) => void;
  onDelete: (postId: string) => void;
  onOpenReel: (post: FeedPost) => void;
}) {
  const action = authorAction(post, userId);
  const [likeBusy, setLikeBusy] = useState(false);
  const likeBusyRef = useRef(false);
  const lastLikeClickAt = useRef(0);
  const toggleLike = async () => {
    const now = Date.now();
    if (likeBusyRef.current || now - lastLikeClickAt.current < 400) return;
    lastLikeClickAt.current = now;
    likeBusyRef.current = true;
    setLikeBusy(true);
    try {
      await onLike(post.id, !post.liked);
    } finally {
      likeBusyRef.current = false;
      setLikeBusy(false);
    }
  };
  return <article className={`feed-post-card${post.kind === "reel" ? " is-reel" : " is-post"}`}>
    <header className="feed-post-header">
      <Avatar initials={initials(post.authorName)} bg="#e2f3e8" fg="#159b62" />
      <span className="feed-post-author"><strong>{post.authorName}</strong><small>{new Date(post.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></span>
      {action && <button className={`feed-connect-button${action !== "Connect" ? " is-pending" : ""}`} type="button" disabled={action !== "Connect"} onClick={() => onConnect(post.authorId)}>{action}</button>}
      <span className="feed-type-pill">{post.kind === "reel" ? "REEL" : "POST"}</span>
      {post.authorId === userId && <button className="feed-delete-button" type="button" aria-label="Delete your post" onClick={() => onDelete(post.id)}><Icon name="delete" size={18} /></button>}
    </header>
    <div className="feed-post-body">
      {post.media?.mimeType.startsWith("video/") && (post.kind === "reel"
        ? <button className="feed-reel-preview" type="button" aria-label={`Open ${post.authorName}'s reel`} onClick={() => onOpenReel(post)}>
          <video className="feed-post-media" src={post.media.url} muted playsInline preload="metadata" aria-hidden="true" />
          <span className="feed-reel-open-indicator"><Icon name="play" size={28} /></span>
        </button>
        : <video className="feed-post-media" src={post.media.url} controls playsInline preload="metadata" aria-label={`${post.authorName}'s ${post.kind}`} />)}
      {post.media?.mimeType.startsWith("image/") && <img className="feed-post-media" src={post.media.url} alt={post.caption || `${post.authorName}'s post`} loading="lazy" />}
      {post.caption && <p className="feed-post-caption">{post.caption}</p>}
      {!post.media && post.kind === "post" && <div className="feed-text-post">{post.caption}</div>}
    </div>
    <div className="feed-post-actions">
      <button type="button" className={post.liked ? "is-liked" : ""} aria-label={post.liked ? "Unlike post" : "Like post"} aria-pressed={post.liked} disabled={likeBusy} onClick={() => void toggleLike()}><Icon name="heart" size={20} /><span>{post.likeCount}</span></button>
      <button type="button" aria-label={`View ${post.commentCount} comments`} onClick={() => onOpenComments(post)}><Icon name="chat" size={20} /><span>{post.commentCount}</span></button>
      <button type="button" className={post.reposted ? "is-selected" : ""} aria-label={post.reposted ? "Undo repost" : "Repost"} aria-pressed={post.reposted} onClick={() => onRepost(post.id, !post.reposted)}><Icon name="repost" size={20} /><span>{post.repostCount || ""}</span></button>
      <button type="button" aria-label={`Share ${post.kind} by ${post.authorName}`} onClick={() => onShare(post)}><Icon name="share" size={20} /></button>
      <button type="button" className={post.saved ? "is-selected" : ""} aria-pressed={post.saved} onClick={() => onSave(post.id, !post.saved)} aria-label={post.saved ? "Unsave post" : "Save post"}><Icon name="bookmark" size={20} /></button>
    </div>
  </article>;
}

function ReelViewerCard({ post, isActive, onLike, onSave, onOpenComments, onShare, notify }: {
  post: FeedPost;
  isActive: boolean;
  onLike: (id: string, active: boolean) => Promise<void>;
  onSave: (id: string, active: boolean) => void;
  onOpenComments: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  notify: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; at: number } | null>(null);
  const likeBusyRef = useRef(false);
  const heartTimer = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [likeBusy, setLikeBusy] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState("");

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isActive) {
      video.pause();
      setIsPlaying(false);
      return;
    }
    void video.play()
      .then(() => { setIsPlaying(true); setPlaybackMessage(""); })
      .catch(() => { setIsPlaying(false); setPlaybackMessage("Tap play to start this reel."); });
  }, [isActive, post.media?.url]);

  useEffect(() => () => {
    if (heartTimer.current !== null) window.clearTimeout(heartTimer.current);
  }, []);

  const updateLike = async (active: boolean) => {
    if (likeBusyRef.current || post.liked === active) return;
    likeBusyRef.current = true;
    setLikeBusy(true);
    try {
      await onLike(post.id, active);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update this reel's like.");
    } finally {
      likeBusyRef.current = false;
      setLikeBusy(false);
    }
  };
  const showHeart = () => {
    setHeartBurst(true);
    if (heartTimer.current !== null) window.clearTimeout(heartTimer.current);
    heartTimer.current = window.setTimeout(() => {
      setHeartBurst(false);
      heartTimer.current = null;
    }, 750);
    if (!post.liked) void updateLike(true);
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) {
      pointerStart.current = null;
      return;
    }
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || (event.target instanceof Element && event.target.closest("button"))) {
      lastTap.current = null;
      return;
    }
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 18) {
      lastTap.current = null;
      return;
    }
    const previousTap = lastTap.current;
    const now = Date.now();
    if (previousTap && now - previousTap.at <= 330 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 56) {
      lastTap.current = null;
      showHeart();
    } else {
      lastTap.current = { x: event.clientX, y: event.clientY, at: now };
    }
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play()
        .then(() => { setIsPlaying(true); setPlaybackMessage(""); })
        .catch(() => { setIsPlaying(false); setPlaybackMessage("Tap play to start this reel."); });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return <section className="reel-viewer-item" aria-label={`Reel by ${post.authorName}`}>
    <div className="reel-viewer-frame">
      <div className="reel-viewer-media-area" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStart.current = null; lastTap.current = null; }}>
        {post.media?.mimeType.startsWith("video/") && <video
          ref={videoRef}
          className="reel-viewer-media"
          src={post.media.url}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-label={`${post.authorName}'s reel`}
          onPlay={() => { setIsPlaying(true); setPlaybackMessage(""); }}
          onPause={() => setIsPlaying(false)}
          onError={() => setPlaybackMessage("This reel could not be loaded.")}
        />}
        {post.media?.mimeType.startsWith("image/") && <img className="reel-viewer-media" src={post.media.url} alt={post.caption || `${post.authorName}'s reel`} />}
        {!post.media && <div className="reel-viewer-unavailable">This reel has no media.</div>}
        {heartBurst && <span className="reel-viewer-heart-burst" aria-hidden="true"><Icon name="heart" size={88} /></span>}
      </div>
      <div className="reel-viewer-gradient" aria-hidden="true" />
      <div className="reel-viewer-author">
        <Avatar initials={initials(post.authorName)} bg="#e2f3e8" fg="#159b62" className="mini-avatar" />
        <span><strong>{post.authorName}</strong><small>{new Date(post.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></span>
      </div>
      <div className="reel-viewer-actions" aria-label="Reel actions">
        <button type="button" className="reel-viewer-action" aria-label={isPlaying ? "Pause reel" : "Play reel"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} size={27} /></button>
        {post.media?.mimeType.startsWith("video/") && <button type="button" className="reel-viewer-action" aria-label={muted ? "Unmute reel" : "Mute reel"} aria-pressed={!muted} onClick={() => setMuted((value) => !value)}><Icon name={muted ? "volumeOff" : "volumeUp"} size={24} /></button>}
        <button type="button" className={`reel-viewer-action reel-viewer-like${post.liked ? " is-liked" : ""}`} aria-label={post.liked ? "Unlike reel" : "Like reel"} aria-pressed={post.liked} disabled={likeBusy} onClick={() => void updateLike(!post.liked)}><Icon name="heart" size={28} /><span>{formatCount(post.likeCount)}</span></button>
        <button type="button" className="reel-viewer-action" aria-label={`View ${post.commentCount} comments`} onClick={() => onOpenComments(post)}><Icon name="chat" size={25} /><span>{formatCount(post.commentCount)}</span></button>
        <button type="button" className="reel-viewer-action" aria-label={`Share reel by ${post.authorName}`} onClick={() => onShare(post)}><Icon name="share" size={24} /></button>
        <button type="button" className={`reel-viewer-action${post.saved ? " is-saved" : ""}`} aria-label={post.saved ? "Unsave reel" : "Save reel"} aria-pressed={post.saved} onClick={() => onSave(post.id, !post.saved)}><Icon name="bookmark" size={24} /></button>
      </div>
      <div className="reel-viewer-caption">
        {post.caption && <p>{post.caption}</p>}
        {playbackMessage && <span className="reel-viewer-playback-message" role="status">{playbackMessage}</span>}
      </div>
    </div>
  </section>;
}

function ReelViewer({ reels, initialPostId, onClose, onLike, onSave, onOpenComments, onShare, notify }: {
  reels: FeedPost[];
  initialPostId: string;
  onClose: () => void;
  onLike: (id: string, active: boolean) => Promise<void>;
  onSave: (id: string, active: boolean) => void;
  onOpenComments: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  notify: (message: string) => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const reelRefs = useRef(new Map<string, HTMLElement>());
  const [activeReelId, setActiveReelId] = useState(initialPostId);

  useLayoutEffect(() => {
    const feedElement = feedRef.current;
    const reelElement = reelRefs.current.get(initialPostId);
    if (!feedElement || !reelElement) return;
    feedElement.scrollTop = reelElement.offsetTop;
    setActiveReelId(initialPostId);
  }, [initialPostId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const updateActiveReel = () => {
    const feedElement = feedRef.current;
    if (!feedElement || !feedElement.clientHeight) return;
    const index = Math.max(0, Math.min(reels.length - 1, Math.round(feedElement.scrollTop / feedElement.clientHeight)));
    const nextId = reels[index]?.id;
    if (nextId) setActiveReelId((current) => current === nextId ? current : nextId);
  };

  return <div className="reel-viewer-backdrop" role="dialog" aria-modal="true" aria-label="Reel viewer">
    <button className="reel-viewer-close" type="button" aria-label="Close reels" onClick={onClose}><Icon name="close" size={25} /></button>
    <div className="reel-viewer-feed" ref={feedRef} tabIndex={0} aria-label="Scroll through reels" onScroll={updateActiveReel} onKeyDown={(event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      feedRef.current?.scrollBy({ top: (event.key === "ArrowDown" ? 1 : -1) * (feedRef.current.clientHeight || window.innerHeight), behavior: "smooth" });
    }}>
      {reels.map((post) => <div
        key={post.id}
        ref={(element) => {
          if (element) reelRefs.current.set(post.id, element);
          else reelRefs.current.delete(post.id);
        }}
        data-reel-id={post.id}
      >
        <ReelViewerCard post={post} isActive={activeReelId === post.id} onLike={onLike} onSave={(id, active) => void onSave(id, active)} onOpenComments={onOpenComments} onShare={onShare} notify={notify} />
      </div>)}
    </div>
  </div>;
}

export function ReelsPage({ feed, chats, userId, onCreatePost, onShare, onLike, onSave, onRepost, onComment, onLoadComments, onConnect, onDeletePost, notify }: {
  feed: FeedPost[];
  chats: Chat[];
  userId: string;
  onCreatePost: (kind: "post" | "reel", file: File | null, caption: string) => Promise<void>;
  onShare: (postId: string, contactId: string) => Promise<void>;
  onLike: (id: string, active: boolean) => Promise<void>;
  onSave: (id: string, active: boolean) => Promise<void>;
  onRepost: (id: string, active: boolean) => Promise<void>;
  onComment: (id: string, text: string) => Promise<FeedComment>;
  onLoadComments: (id: string) => Promise<FeedComment[]>;
  onConnect: (authorId: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const reelFileInput = useRef<HTMLInputElement>(null);
  const [publishingReel, setPublishingReel] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [activeComments, setActiveComments] = useState<FeedPost | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sharingPost, setSharingPost] = useState<FeedPost | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const reels = feed.filter((post) => post.kind === "reel");
  const closeReelViewer = useCallback(() => setActiveReelId(null), []);

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    try {
      await action();
      if (successMessage) notify(successMessage);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "The action could not be completed.");
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
  const selectReelFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith("video/")) {
      notify("Choose a video to create a reel.");
      return;
    }
    setPublishingReel(true);
    void onCreatePost("reel", selectedFile, "")
      .then(() => notify("Reel shared."))
      .catch((cause: unknown) => notify(cause instanceof Error ? cause.message : "Could not publish this reel."))
      .finally(() => setPublishingReel(false));
  };
  const chooseReelVideo = () => {
    if (publishingReel) return;
    if (reelFileInput.current) reelFileInput.current.value = "";
    reelFileInput.current?.click();
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
  const sharePost = async (chat: Chat) => {
    if (!sharingPost || shareBusy) return;
    setShareBusy(true);
    try {
      await onShare(sharingPost.id, chat.id);
      setSharingPost(null);
      notify(`Shared with ${chat.name}.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not share this post.");
    } finally {
      setShareBusy(false);
    }
  };

  return <section className="page-section feed-page">
    <div className="reels-toolbar" aria-label="Create content">
      <button className="icon-button round-page-action primary-round-action" type="button" aria-label={publishingReel ? "Publishing reel" : "Choose a video from gallery"} title={publishingReel ? "Publishing reel" : "Create a reel from gallery"} disabled={publishingReel} onClick={chooseReelVideo}><Icon name="movie" size={19} /></button>
    </div>
    <input ref={reelFileInput} className="visually-hidden" type="file" accept="video/*" onChange={selectReelFile} tabIndex={-1} aria-hidden="true" />
    <div className="feed-layout">
      <div className="reels-feed" aria-label="Posts and reels">
        {feed.length
          ? feed.map((post) => <FeedCard key={post.id} post={post} userId={userId} onLike={(id, active) => runAction(() => onLike(id, active))} onSave={(id, active) => void runAction(() => onSave(id, active))} onRepost={(id, active) => void runAction(() => onRepost(id, active))} onOpenComments={(postToOpen) => void openComments(postToOpen)} onShare={setSharingPost} onConnect={(id) => void runAction(() => onConnect(id), "Connection request sent.")} onDelete={(id) => void runAction(() => onDeletePost(id))} onOpenReel={(postToOpen) => setActiveReelId(postToOpen.id)} />)
          : <div className="feed-empty-state reels-empty-state" role="status">
            <span className="empty-search-icon"><Icon name="movie" size={22} /></span>
            <strong>No reels yet</strong>
          </div>}
      </div>
    </div>

    {activeReelId && reels.length > 0 && <ReelViewer
      reels={reels}
      initialPostId={activeReelId}
      onClose={closeReelViewer}
      onLike={onLike}
      onSave={(id, active) => void runAction(() => onSave(id, active))}
      onOpenComments={(postToOpen) => void openComments(postToOpen)}
      onShare={setSharingPost}
      notify={notify}
    />}

    {sharingPost && <div className="feed-modal-backdrop" onClick={() => !shareBusy && setSharingPost(null)}>
      <section className="feed-share-modal" role="dialog" aria-modal="true" aria-labelledby="feed-share-title" onClick={(event) => event.stopPropagation()}>
        <div className="feed-modal-heading"><div><div className="eyebrow">SHARE INCHAT</div><h2 id="feed-share-title">Send to a chat</h2></div><button type="button" className="icon-button" disabled={shareBusy} aria-label="Close share dialog" onClick={() => setSharingPost(null)}><Icon name="close" /></button></div>
        {chats.length
          ? <div className="feed-share-list">{chats.map((chat) => <button type="button" className="feed-share-contact" key={chat.id} disabled={shareBusy} onClick={() => void sharePost(chat)}>
            <Avatar initials={chat.initials} bg={chat.bg} fg={chat.fg} online={chat.online} className="mini-avatar" />
            <span><strong>{chat.name}</strong><small>{chat.online ? "Online now" : "Send reel or post"}</small></span>
            <Icon name="send" size={17} />
          </button>)}</div>
          : <p className="feed-share-empty">Accept a connection request first to share posts in a chat.</p>}
      </section>
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
