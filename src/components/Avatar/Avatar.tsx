import type { CSSProperties } from "react";

export function Avatar({ initials, bg, fg, online = false, className = "" }: { initials: string; bg: string; fg: string; online?: boolean; className?: string }) {
  return <span className={`avatar ${className}`} style={{ "--avatar-bg": bg, "--avatar-fg": fg } as CSSProperties} aria-hidden="true">{initials}{online && <i className="online-dot" />}</span>;
}
