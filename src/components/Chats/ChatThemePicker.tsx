import { useEffect, useState, type CSSProperties } from "react";
import { bubbleThemeGroups, chatBubbleThemes, chatWallpaperThemes, wallpaperThemeGroups } from "../../data/chatThemes";
import type { ChatTheme } from "../../types";
import { Icon } from "../Icon";

type ThemeSection = "bubbles" | "wallpapers" | "ai";

const bubblePreviewWallpaperGroup: Record<string, string> = {
  featured: "featured",
  nature: "nature",
  live: "live",
  minimal: "colour",
  doodle: "gradient",
};

function bubbleStyle(theme: { mine: string; mineText: string; theirs: string; theirsText: string }): CSSProperties {
  return {
    "--chat-bubble-mine": theme.mine,
    "--chat-bubble-mine-text": theme.mineText,
    "--chat-bubble-theirs": theme.theirs,
    "--chat-bubble-theirs-text": theme.theirsText,
  } as CSSProperties;
}

function bubblePreviewBackground(groupId: string, index: number) {
  const wallpaperGroupId = bubblePreviewWallpaperGroup[groupId];
  const wallpaperGroup = wallpaperThemeGroups.find((group) => group.id === wallpaperGroupId);
  return wallpaperGroup?.options[index]?.background ?? "linear-gradient(145deg, #edf4ef, #dcebe1)";
}

export function ChatThemePicker({ theme, onChange, onClose }: {
  theme: ChatTheme;
  onChange: (theme: ChatTheme) => Promise<void>;
  onClose: () => void;
}) {
  const [section, setSection] = useState<ThemeSection>("bubbles");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const selectedBubble = chatBubbleThemes.find((option) => option.id === theme.bubble) ?? chatBubbleThemes[0];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const saveTheme = async (nextTheme: ChatTheme) => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onChange(nextTheme);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this chat theme.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="chat-theme-backdrop" onClick={() => { if (!saving) onClose(); }}>
    <section className="chat-theme-picker" role="dialog" aria-modal="true" aria-busy={saving} aria-labelledby="chat-theme-title" onClick={(event) => event.stopPropagation()}>
      <header className="chat-theme-heading">
        <button className="icon-button" type="button" aria-label="Back to chat" title="Back to chat" disabled={saving} onClick={onClose}><Icon name="back" size={19} /></button>
        <h2 id="chat-theme-title">Chat theme</h2>
      </header>
      <div className="chat-theme-sections" role="tablist" aria-label="Chat theme types">
        <button type="button" role="tab" aria-selected={section === "bubbles"} className={section === "bubbles" ? "selected" : ""} onClick={() => setSection("bubbles")}>
          <Icon name="chat" size={19} /><span>Chat bubble</span>
        </button>
        <button type="button" role="tab" aria-selected={section === "wallpapers"} className={section === "wallpapers" ? "selected" : ""} onClick={() => setSection("wallpapers")}>
          <Icon name="image" size={19} /><span>Wallpaper</span>
        </button>
        <button type="button" role="tab" aria-selected={section === "ai"} className={section === "ai" ? "selected" : ""} onClick={() => setSection("ai")}>
          <Icon name="ai" size={19} /><span>Use AI</span>
        </button>
      </div>
      {section === "bubbles" && <div className="chat-theme-groups" aria-label="Chat bubble themes">
        {bubbleThemeGroups.map((group) => <section className="chat-theme-group" key={group.id} aria-label={`${group.title} chat bubbles`}>
          <h3>{group.title}</h3>
          <div className="chat-theme-rail">
            {group.options.map((option, index) => <button
              key={option.id}
              className={`chat-theme-tile${theme.bubble === option.id ? " selected" : ""}`}
              type="button"
              aria-label={`${option.label} bubble theme`}
              aria-pressed={theme.bubble === option.id}
              disabled={saving}
              onClick={() => void saveTheme({ ...theme, bubble: option.id })}
            >
              <span className="chat-theme-preview" style={{ ...bubbleStyle(option), background: bubblePreviewBackground(group.id, index) }}>
                <span className="theme-preview-incoming">Hey there</span>
                <span className="theme-preview-outgoing">Hello!</span>
                <span className="theme-preview-incoming short">Nice to see you</span>
              </span>
              <span className="chat-theme-tile-label"><strong>{option.label}</strong>{theme.bubble === option.id && <Icon name="check" size={15} />}</span>
            </button>)}
          </div>
        </section>)}
      </div>}
      {section === "wallpapers" && <div className="chat-theme-groups" aria-label="Chat wallpapers">
        {wallpaperThemeGroups.map((group) => <section className="chat-theme-group" key={group.id} aria-label={`${group.title} wallpapers`}>
          <h3>{group.title}</h3>
          <div className="chat-theme-rail">
            {group.options.map((option) => {
              const wallpaper = chatWallpaperThemes.find((item) => item.id === option.id);
              if (!wallpaper) return null;
              return <button
                key={option.id}
                className={`chat-theme-tile${theme.wallpaper === option.id ? " selected" : ""}`}
                type="button"
                aria-label={`${option.label} wallpaper`}
                aria-pressed={theme.wallpaper === option.id}
                disabled={saving}
                onClick={() => void saveTheme({ ...theme, wallpaper: option.id })}
              >
                <span className="chat-theme-preview" style={{ ...bubbleStyle(selectedBubble), background: wallpaper.background }}>
                  <span className="theme-preview-incoming">Hey there</span>
                  <span className="theme-preview-outgoing">Hello!</span>
                  <span className="theme-preview-incoming short">Nice to see you</span>
                </span>
                <span className="chat-theme-tile-label"><strong>{option.label}</strong>{theme.wallpaper === option.id && <Icon name="check" size={15} />}</span>
              </button>;
            })}
          </div>
        </section>)}
      </div>}
      {section === "ai" && <div className="chat-theme-ai-panel" role="status">
        <Icon name="ai" size={24} />
        <strong>AI themes are not configured yet</strong>
        <p>Choose a ready-made bubble or wallpaper theme, or configure an AI provider to create a custom look.</p>
      </div>}
      <footer className="chat-theme-footer">
        <span className={saveError ? "chat-theme-error" : ""} role={saveError ? "alert" : "status"}>
          {saveError || (saving ? "Saving for this chat…" : "Theme is saved for this chat.")}
        </span>
      </footer>
    </section>
  </div>;
}
