import type { ReactNode } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import type { StorageInfo, User } from "../../types";
import type { IconName } from "../../types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Toggle({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return <button className={`toggle${checked ? " checked" : ""}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={(event) => { event.stopPropagation(); onClick(); }}><span /></button>;
}

function SettingRow({ icon, title, description, trailing, onClick }: { icon: IconName; title: string; description: string; trailing?: ReactNode; onClick?: () => void }) {
  return <div className="setting-row" role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) onClick(); }}>
    <span className="setting-icon"><Icon name={icon} size={19} /></span>
    <span className="setting-copy"><strong>{title}</strong><small>{description}</small></span>
    {trailing ?? <Icon name="chevron" size={18} className="setting-chevron" />}
  </div>;
}

export function SettingsPage({ user, storage, notificationsOn, darkMode, showPresenceStatus, onToggleNotifications, onToggleDarkMode, onTogglePresenceStatus, onClearStorage, onSignOut }: {
  user: User;
  storage: StorageInfo;
  notificationsOn: boolean;
  darkMode: boolean;
  showPresenceStatus: boolean;
  onToggleNotifications: () => void;
  onToggleDarkMode: () => void;
  onTogglePresenceStatus: () => void;
  onClearStorage: () => void;
  onSignOut: () => void;
}) {
  return <section className="page-section settings-page">
    <div className="page-intro"><div><h1>Settings</h1></div></div>
    <div className="settings-profile surface-card">
      <Avatar initials={initials(user.name)} bg="#e2f3e8" fg="#159b62" className="profile-avatar" />
      <span className="profile-details"><strong>{user.name}</strong><small>{user.email}</small></span>
      <span className="profile-edit">Local demo account</span>
    </div>
    <div className="settings-columns">
      <div className="settings-group surface-card">
        <div className="settings-group-title">PREFERENCES</div>
        <SettingRow icon="bell" title="Notifications" description="Browser alerts for incoming messages" trailing={<Toggle checked={notificationsOn} onClick={onToggleNotifications} label="Toggle notifications" />} />
        <SettingRow icon="palette" title="Appearance" description="Switch between dark and light mode" trailing={<Toggle checked={darkMode} onClick={onToggleDarkMode} label="Toggle dark mode" />} />
        <SettingRow icon="eye" title="Chat presence" description="Show online/offline status in chats on this device" trailing={<Toggle checked={showPresenceStatus} onClick={onTogglePresenceStatus} label="Toggle chat presence status" />} />
      </div>
      <div className="settings-group surface-card">
        <div className="settings-group-title">ACCOUNT & STORAGE</div>
        <div className="storage-summary">
          <div className="storage-summary-heading"><span className="setting-icon"><Icon name="storage" size={19} /></span><span className="setting-copy"><strong>Shared local storage</strong><small>SQLite database and uploaded files · saved on this computer</small></span><strong className="storage-size">{formatBytes(storage.databaseBytes + (storage.mediaBytes ?? 0))}</strong></div>
          <div className="storage-counts"><span>{storage.users} accounts</span><span>{storage.connections} connections</span><span>{storage.pendingRequests} pending requests</span><span>{storage.messages} messages</span><span>{storage.calls} calls</span><span>{storage.posts ?? 0} posts & reels</span><span>{storage.stories ?? 0} updates</span><span>{storage.notes ?? 0} notes</span><span>{storage.mediaFiles ?? 0} media files</span></div>
          <button className="danger-button" type="button" onClick={onClearStorage}>Clear messages and call history</button>
          <small className="storage-preserve-note">Account identities and accepted connections are kept.</small>
        </div>
        <SettingRow icon="user" title="Sign out" description="Keep your account and history on this computer" onClick={onSignOut} />
        <div className="settings-build"><span className="brand-mark small-mark">IN</span><span><strong>INChat</strong><small>Local two-app demo</small></span><small className="build-version">VERSION 1.0</small></div>
      </div>
    </div>
  </section>;
}
