import { useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";

type CallOverlayProps = {
  call: {
    peerName: string;
    kind: "voice" | "video";
    direction: "incoming" | "outgoing";
    status: "incoming" | "outgoing" | "connecting" | "connected";
    elapsedSeconds: number;
  };
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  cameraSwitchSupported: boolean;
  noiseSuppression: boolean;
  audioTouchUp: boolean;
  audioSettingsSupport: { noiseSuppression: boolean; audioTouchUp: boolean };
  error: string;
  onAccept: () => Promise<void>;
  onFinish: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleCameraFacing: () => Promise<void>;
  onToggleNoiseSuppression: () => Promise<void>;
  onToggleAudioTouchUp: () => Promise<void>;
  onError: (message: string) => void;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function ControlButton({ icon, label, active = false, danger = false, onClick, disabled = false }: {
  icon: "callEnd" | "mic" | "micOff" | "video" | "videoOff" | "flipCamera" | "volumeUp" | "volumeOff" | "call";
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button className={`call-control${active ? " is-active" : ""}${danger ? " is-danger" : ""}`} type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active}>
    <span className="call-control-icon"><Icon name={icon} size={23} /></span>
    <span className="call-control-label">{label}</span>
  </button>;
}

function AudioSetting({ title, description, checked, supported, disabled, icon, onClick }: {
  title: string;
  description: string;
  checked: boolean;
  supported: boolean;
  disabled: boolean;
  icon: "noiseSuppression" | "touchUp";
  onClick: () => void;
}) {
  return <div className="call-setting-row">
    <span className="call-setting-icon"><Icon name={icon} size={20} /></span>
    <span className="call-setting-copy"><strong>{title}</strong><small>{supported ? description : "Not supported by this browser"}</small></span>
    <button className={`toggle${checked ? " checked" : ""}`} type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled || !supported} onClick={onClick}><span /></button>
  </div>;
}

export function CallOverlay({
  call,
  localStream,
  remoteStream,
  muted,
  cameraEnabled,
  cameraSwitchSupported,
  noiseSuppression,
  audioTouchUp,
  audioSettingsSupport,
  error,
  onAccept,
  onFinish,
  onToggleMicrophone,
  onToggleCamera,
  onToggleCameraFacing,
  onToggleNoiseSuppression,
  onToggleAudioTouchUp,
  onError,
}: CallOverlayProps) {
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [localPreviewBlocked, setLocalPreviewBlocked] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (remoteAudio.current && remoteStream) {
      remoteAudio.current.srcObject = remoteStream;
      remoteAudio.current.muted = speakerMuted;
      void remoteAudio.current.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    }
    if (call.kind === "video" && remoteVideo.current && remoteStream) {
      remoteVideo.current.srcObject = remoteStream;
      remoteVideo.current.muted = true;
      void remoteVideo.current.play().catch(() => undefined);
    }
  }, [call.kind, minimized, remoteStream, speakerMuted]);

  useEffect(() => {
    if (!localVideo.current || !localStream) return;
    localVideo.current.srcObject = localStream;
    void localVideo.current.play().then(() => setLocalPreviewBlocked(false)).catch(() => setLocalPreviewBlocked(true));
  }, [localStream, minimized]);

  const enablePlayback = () => {
    if (remoteAudio.current) void remoteAudio.current.play().then(() => setPlaybackBlocked(false)).catch(() => onError("The browser could not play the remote call audio."));
  };
  const enableLocalPreview = () => {
    if (localVideo.current) void localVideo.current.play().then(() => setLocalPreviewBlocked(false)).catch(() => setLocalPreviewBlocked(true));
  };
  const accept = () => { void onAccept().catch((cause: unknown) => onError(cause instanceof Error ? cause.message : "Could not answer the call.")); };
  const runSetting = (action: () => Promise<void>) => {
    void action().catch((cause: unknown) => onError(cause instanceof Error ? cause.message : "Could not update call audio settings."));
  };
  const status = call.status === "incoming"
    ? `Incoming ${call.kind} call`
    : call.status === "outgoing"
      ? "Ringing…"
      : call.status === "connected"
        ? formatDuration(call.elapsedSeconds)
        : "Contacting…";

  if (minimized) {
    return <aside className="call-mini-bar" aria-label={`${call.kind} call with ${call.peerName}`}>
      <span className="call-mini-media" aria-hidden="true">
        <audio ref={remoteAudio} autoPlay />
        {call.kind === "video" && remoteStream && <video ref={remoteVideo} autoPlay playsInline />}
        {call.kind === "video" && localStream && <video ref={localVideo} autoPlay muted playsInline />}
      </span>
      <Avatar initials={initials(call.peerName)} bg="#214334" fg="#a7e9c2" />
      <span className="call-mini-copy"><strong>{call.peerName}</strong><small>{status}</small></span>
      <button className="call-mini-return" type="button" onClick={() => setMinimized(false)}><Icon name="call" size={18} /> Return to call</button>
      <button className="call-mini-end" type="button" aria-label="End call" onClick={onFinish}><Icon name="callEnd" size={20} /></button>
    </aside>;
  }

  return <div className={`call-overlay${call.kind === "video" ? " video-call-overlay" : ""}`}>
    <section className={`call-window${call.kind === "video" ? " immersive-video-call" : " immersive-audio-call"}`} role="dialog" aria-modal="true" aria-label={`${call.kind} call with ${call.peerName}`}>
      <header className="call-topbar">
        <button className="call-top-icon" type="button" aria-label="Minimize call" onClick={() => setMinimized(true)}><Icon name="minimize" size={24} /></button>
        <span className="call-kind-label">{call.kind === "video" ? "Video call" : "Audio call"}</span>
        <button className="call-top-icon" type="button" aria-label="Call settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><Icon name="moreVertical" size={23} /></button>
      </header>

      <div className={`call-stage${call.kind === "video" ? " video-stage" : " audio-stage"}${remoteStream ? " has-remote-media" : ""}`}>
        {call.kind === "video" && remoteStream
          ? <video ref={remoteVideo} className="remote-video" autoPlay playsInline aria-label={`${call.peerName} video`} />
          : <div className="call-backdrop" aria-hidden="true" />}
        {!(call.kind === "video" && remoteStream) && <div className="call-peer-placeholder">
          <Avatar initials={initials(call.peerName)} bg="#244534" fg="#b7f1cf" className="call-peer-avatar" />
          <strong>{call.peerName}</strong>
          <small>{status}</small>
        </div>}
        {call.kind === "video" && localStream && <video ref={localVideo} className="local-video" autoPlay muted playsInline aria-label="Your camera preview" />}
        {call.status === "connected" && <div className="call-duration-pill">{formatDuration(call.elapsedSeconds)}</div>}
      </div>
      <audio ref={remoteAudio} className="call-audio-sink" autoPlay />

      {playbackBlocked && <button className="enable-call-audio" onClick={enablePlayback}>Enable call audio</button>}
      {localPreviewBlocked && localStream && <button className="enable-call-audio" onClick={enableLocalPreview}>Enable local camera preview</button>}
      {error && <div className="call-error" role="alert">{error}</div>}

      <div className="call-controls">
        {call.status === "incoming" ? <>
          <ControlButton icon="callEnd" label="Decline call" danger onClick={onFinish} />
          <ControlButton icon="call" label={`Accept ${call.kind} call`} onClick={accept} />
        </> : <>
          {localStream && <ControlButton icon={muted ? "micOff" : "mic"} label={muted ? "Unmute microphone" : "Mute microphone"} active={muted} onClick={onToggleMicrophone} />}
          {call.kind === "video" && localStream && <ControlButton icon={cameraEnabled ? "video" : "videoOff"} label={cameraEnabled ? "Turn camera off" : "Turn camera on"} active={!cameraEnabled} onClick={onToggleCamera} />}
          {call.kind === "video" && localStream && cameraSwitchSupported && <ControlButton icon="flipCamera" label="Switch camera" onClick={() => runSetting(onToggleCameraFacing)} />}
          <ControlButton icon={speakerMuted ? "volumeOff" : "volumeUp"} label={speakerMuted ? "Unmute call audio" : "Mute call audio"} active={speakerMuted} onClick={() => setSpeakerMuted((value) => !value)} />
          <ControlButton icon="callEnd" label={call.status === "outgoing" ? "Cancel call" : "End call"} danger onClick={onFinish} />
        </>}
      </div>
      <p className="call-local-note">Direct peer-to-peer call · allow microphone{call.kind === "video" ? " and camera" : ""} access</p>

      {settingsOpen && <div className="call-settings-backdrop" onClick={() => setSettingsOpen(false)}>
        <section className="call-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="call-settings-title" onClick={(event) => event.stopPropagation()}>
          <div className="call-settings-handle" />
          <div className="call-settings-header"><h2 id="call-settings-title">Call settings</h2><button className="call-top-icon" type="button" aria-label="Close call settings" onClick={() => setSettingsOpen(false)}><Icon name="close" /></button></div>
          <AudioSetting title="Noise suppression" description="Reduce background noise from your microphone" checked={noiseSuppression} supported={audioSettingsSupport.noiseSuppression} disabled={!localStream} icon="noiseSuppression" onClick={() => runSetting(onToggleNoiseSuppression)} />
          <AudioSetting title="Audio touch-up" description="Adjust microphone level automatically" checked={audioTouchUp} supported={audioSettingsSupport.audioTouchUp} disabled={!localStream} icon="touchUp" onClick={() => runSetting(onToggleAudioTouchUp)} />
        </section>
      </div>}
    </section>
  </div>;
}
