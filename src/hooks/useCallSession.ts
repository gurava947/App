import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { realtimeUrl } from "../services/api";
import type { User } from "../types";

type CallKind = "voice" | "video";
type CallStatus = "incoming" | "outgoing" | "connecting" | "connected";
type CallView = {
  id: string;
  peerId: string;
  peerName: string;
  kind: CallKind;
  direction: "incoming" | "outgoing";
  status: CallStatus;
  elapsedSeconds: number;
};
type CallSignal = {
  callId: string;
  fromUserId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

function mediaError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Allow microphone and camera access in your browser to make this call.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone or camera was found for this call.";
  }
  return error instanceof Error ? error.message : "Could not start the call.";
}

function cameraModes(stream: MediaStream): VideoFacingModeEnum[] {
  const track = stream.getVideoTracks()[0];
  if (!track) return [];
  const modes = track.getCapabilities().facingMode ?? [];
  return modes.filter((mode): mode is VideoFacingModeEnum =>
    mode === "user" || mode === "environment" || mode === "left" || mode === "right");
}

function audioTrackConstraints(noiseSuppression: boolean, audioTouchUp: boolean, support: { noiseSuppression: boolean; audioTouchUp: boolean }): MediaTrackConstraints {
  return {
    echoCancellation: true,
    ...(support.noiseSuppression ? { noiseSuppression } : {}),
    ...(support.audioTouchUp ? { autoGainControl: audioTouchUp } : {}),
  };
}

export function useCallSession(user: User | null, onHistoryChanged: () => void, onProblem: (message: string) => void) {
  const [activeCall, setActiveCall] = useState<CallView | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<VideoFacingModeEnum>("user");
  const [cameraFacings, setCameraFacings] = useState<VideoFacingModeEnum[]>([]);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioTouchUp, setAudioTouchUp] = useState(true);
  const [callError, setCallError] = useState("");
  const audioSettingsSupport = useMemo(() => {
    const supported = navigator.mediaDevices?.getSupportedConstraints?.();
    return {
      noiseSuppression: Boolean(supported?.noiseSuppression),
      audioTouchUp: Boolean(supported?.autoGainControl),
    };
  }, []);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const activeCallRef = useRef<CallView | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const startingRef = useRef(false);
  const acceptingRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const connectionTimerRef = useRef<number | null>(null);

  const updateCall = useCallback((update: Partial<CallView>) => {
    const current = activeCallRef.current;
    if (!current) return;
    const next = { ...current, ...update };
    activeCallRef.current = next;
    setActiveCall(next);
  }, []);
  const reportFailure = useCallback((error: unknown) => {
    const message = mediaError(error);
    setCallError(message);
    onProblem(message);
  }, [onProblem]);

  const releaseMedia = useCallback(() => {
    if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    connectedAtRef.current = null;
    activeCallRef.current = null;
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraEnabled(true);
    setCameraFacings([]);
  }, []);

  const emitWithAck = useCallback(<T,>(event: string, payload: object) => new Promise<T>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      reject(new Error("The call connection to the local server was lost."));
      return;
    }
    socket.emit(event, payload, (response: T & { error?: string }) => {
      if (response.error) reject(new Error(response.error));
      else resolve(response);
    });
  }), []);

  const waitForSocket = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error("The local call service is not ready yet.");
    if (socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Could not connect to the local call service.")), 5000);
      socket.once("connect", () => {
        window.clearTimeout(timeout);
        resolve();
      });
      socket.once("connect_error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not connect to the local call service."));
      });
    });
  }, []);

  const sendSignal = useCallback((callId: string, toUserId: string, signal: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => new Promise<void>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      reject(new Error("The call connection to the local server was lost."));
      return;
    }
    socket.emit("call:signal", { callId, toUserId, ...signal }, (response: { error?: string }) => {
      if (response?.error) reject(new Error(response.error));
      else resolve();
    });
  }), []);

  const createPeer = useCallback((callId: string, peerId: string, stream: MediaStream) => {
    const connection = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = connection;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendSignal(callId, peerId, { candidate: event.candidate.toJSON() }).catch((error: unknown) => {
        reportFailure(error);
        socketRef.current?.emit("call:end", { callId, status: "failed" });
        releaseMedia();
        onHistoryChanged();
      });
    };
    connection.ontrack = (event) => {
      const streamFromTrack = event.streams[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = streamFromTrack;
      setRemoteStream(streamFromTrack);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = null;
        if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
        updateCall({ status: "connected" });
      } else if (connection.connectionState === "disconnected") {
        updateCall({ status: "connecting" });
        if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = window.setTimeout(() => {
          if (peerRef.current?.connectionState === "disconnected") {
            socketRef.current?.emit("call:end", { callId, status: "failed" });
            releaseMedia();
            onHistoryChanged();
          }
        }, 10_000);
      } else if (connection.connectionState === "failed") {
        reportFailure(new Error("The peer-to-peer media connection failed."));
        socketRef.current?.emit("call:end", { callId, status: "failed" });
        releaseMedia();
        onHistoryChanged();
      }
    };
    return connection;
  }, [onHistoryChanged, releaseMedia, reportFailure, sendSignal, updateCall]);

  const finishCall = useCallback((status?: "failed") => {
    const call = activeCallRef.current;
    if (!call) return;
    const socket = socketRef.current;
    if (call.direction === "incoming" && call.status === "incoming") {
      socket?.emit("call:decline", { callId: call.id });
    } else {
      socket?.emit("call:end", { callId: call.id, status });
    }
    releaseMedia();
    onHistoryChanged();
  }, [onHistoryChanged, releaseMedia]);

  useEffect(() => {
    if (!user) return;
    const socket = io(realtimeUrl, { query: { userId: user.id } });
    socketRef.current = socket;

    socket.on("call:incoming", (event: { callId: string; callerId: string; callerName: string; kind: CallKind }) => {
      if (activeCallRef.current) {
        socket.emit("call:decline", { callId: event.callId });
        return;
      }
      setCallError("");
      const next: CallView = {
        id: event.callId,
        peerId: event.callerId,
        peerName: event.callerName,
        kind: event.kind,
        direction: "incoming",
        status: "incoming",
        elapsedSeconds: 0,
      };
      activeCallRef.current = next;
      setActiveCall(next);
    });

    socket.on("call:accepted", async (event: { callId: string }) => {
      const call = activeCallRef.current;
      if (!call || call.id !== event.callId || call.direction !== "outgoing") return;
      try {
        updateCall({ status: "connecting" });
        const connection = peerRef.current;
        if (!connection) throw new Error("The call media connection is not ready.");
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal(call.id, call.peerId, { description: connection.localDescription?.toJSON() });
      } catch (error) {
        reportFailure(error);
        socket.emit("call:end", { callId: call.id, status: "failed" });
        releaseMedia();
        onHistoryChanged();
      }
    });

    socket.on("call:signal", async (event: CallSignal) => {
      const call = activeCallRef.current;
      const connection = peerRef.current;
      if (!call || call.id !== event.callId || !connection) return;
      try {
        if (event.description) {
          await connection.setRemoteDescription(new RTCSessionDescription(event.description));
          for (const candidate of pendingCandidatesRef.current) {
            await connection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
          if (event.description.type === "offer") {
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendSignal(call.id, call.peerId, { description: connection.localDescription?.toJSON() });
          }
        }
        if (event.candidate) {
          if (connection.remoteDescription) await connection.addIceCandidate(new RTCIceCandidate(event.candidate));
          else pendingCandidatesRef.current.push(event.candidate);
        }
      } catch (error) {
        reportFailure(error);
        socket.emit("call:end", { callId: call.id, status: "failed" });
        releaseMedia();
        onHistoryChanged();
      }
    });

    socket.on("call:ended", (event: { callId: string; status: string }) => {
      if (activeCallRef.current?.id !== event.callId) return;
      releaseMedia();
      if (event.status === "missed") onProblem("No answer. This call was saved as missed.");
      else if (event.status === "declined") onProblem("The other account did not answer. This call was saved as missed.");
      else if (event.status === "failed") onProblem("The call ended because the peer-to-peer connection failed.");
      else if (event.status === "cancelled") onProblem("The other account cancelled the call.");
      onHistoryChanged();
    });

    return () => {
      const call = activeCallRef.current;
      if (call) socket.emit("call:end", { callId: call.id, status: "failed" });
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      releaseMedia();
    };
  }, [user, onHistoryChanged, onProblem, releaseMedia, reportFailure, sendSignal, updateCall]);

  useEffect(() => {
    if (activeCall?.status !== "connected") return;
    const timer = window.setInterval(() => {
      if (connectedAtRef.current !== null) {
        updateCall({ elapsedSeconds: Math.floor((Date.now() - connectedAtRef.current) / 1000) });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.status, updateCall]);

  const startCall = useCallback(async (recipientId: string, peerName: string, kind: CallKind) => {
    if (activeCallRef.current || startingRef.current) throw new Error("Finish the current call before starting another.");
    startingRef.current = true;
    let callId: string | null = null;
    try {
      await waitForSocket();
      setCallError("");
      const result = await emitWithAck<{ callId: string; status: "ringing" }>("call:start", { recipientId, kind });
      callId = result.callId;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone and camera access is unavailable in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioTrackConstraints(noiseSuppression, audioTouchUp, audioSettingsSupport),
        video: kind === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraEnabled(kind === "video");
      setCameraFacings(cameraModes(stream));
      setCameraFacing(stream.getVideoTracks()[0]?.getSettings().facingMode === "environment" ? "environment" : "user");
      const call: CallView = {
        id: result.callId,
        peerId: recipientId,
        peerName,
        kind,
        direction: "outgoing",
        status: "outgoing",
        elapsedSeconds: 0,
      };
      activeCallRef.current = call;
      setActiveCall(call);
      createPeer(call.id, call.peerId, stream);
      await emitWithAck<{ ready: boolean }>("call:ready", { callId: call.id });
      onHistoryChanged();
    } catch (error) {
      if (callId) socketRef.current?.emit("call:end", { callId, status: "failed" });
      releaseMedia();
      throw error;
    } finally {
      startingRef.current = false;
    }
  }, [audioSettingsSupport, audioTouchUp, createPeer, emitWithAck, noiseSuppression, onHistoryChanged, onProblem, releaseMedia, waitForSocket]);

  const acceptCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call || call.direction !== "incoming" || acceptingRef.current) {
      throw new Error("This incoming call is no longer available.");
    }
    acceptingRef.current = true;
    setCallError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone and camera access is unavailable in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioTrackConstraints(noiseSuppression, audioTouchUp, audioSettingsSupport),
        video: call.kind === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraEnabled(call.kind === "video");
      setCameraFacings(cameraModes(stream));
      setCameraFacing(stream.getVideoTracks()[0]?.getSettings().facingMode === "environment" ? "environment" : "user");
      createPeer(call.id, call.peerId, stream);
      updateCall({ status: "connecting" });
      await emitWithAck<{ accepted: boolean }>("call:accept", { callId: call.id });
      onHistoryChanged();
    } catch (error) {
      socketRef.current?.emit("call:decline", { callId: call.id });
      releaseMedia();
      throw new Error(mediaError(error));
    } finally {
      acceptingRef.current = false;
    }
  }, [audioSettingsSupport, audioTouchUp, createPeer, emitWithAck, noiseSuppression, onHistoryChanged, releaseMedia, updateCall]);

  const toggleMicrophone = useCallback(() => {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const nextEnabled = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  const toggleCameraFacing = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) throw new Error("Camera switching is unavailable for this call.");
    if (cameraFacings.length < 2) throw new Error("This device does not offer another camera direction.");
    const currentIndex = cameraFacings.indexOf(cameraFacing);
    const nextFacing = cameraFacings[(currentIndex + 1) % cameraFacings.length];
    await track.applyConstraints({ facingMode: { exact: nextFacing } });
    setCameraFacing(nextFacing);
  }, [cameraFacings, cameraFacing]);

  const toggleNoiseSuppression = useCallback(async () => {
    if (!audioSettingsSupport.noiseSuppression) throw new Error("Noise suppression is not supported by this browser.");
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) throw new Error("Join a call before changing audio processing.");
    const enabled = !noiseSuppression;
    await track.applyConstraints({ noiseSuppression: enabled });
    setNoiseSuppression(enabled);
  }, [audioSettingsSupport.noiseSuppression, noiseSuppression]);

  const toggleAudioTouchUp = useCallback(async () => {
    if (!audioSettingsSupport.audioTouchUp) throw new Error("Audio touch-up is not supported by this browser.");
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) throw new Error("Join a call before changing audio processing.");
    const enabled = !audioTouchUp;
    await track.applyConstraints({ autoGainControl: enabled });
    setAudioTouchUp(enabled);
  }, [audioSettingsSupport.audioTouchUp, audioTouchUp]);

  return {
    activeCall,
    localStream,
    remoteStream,
    muted,
    cameraEnabled,
    cameraSwitchSupported: cameraFacings.length > 1,
    noiseSuppression,
    audioTouchUp,
    audioSettingsSupport,
    callError,
    startCall,
    acceptCall,
    finishCall,
    toggleMicrophone,
    toggleCamera,
    toggleCameraFacing,
    toggleNoiseSuppression,
    toggleAudioTouchUp,
  };
}
