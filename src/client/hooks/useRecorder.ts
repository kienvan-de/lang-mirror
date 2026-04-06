import { useState, useRef, useCallback, useEffect } from "react";

export type PermissionState = "unknown" | "granted" | "denied" | "unavailable";

export interface UseRecorderReturn {
  start: () => Promise<void>;
  stop: () => void;
  recordingBlob: Blob | null;
  mimeType: string | null;
  isRecording: boolean;
  permissionState: PermissionState;
  mediaStream: MediaStream | null;
  error: string | null;
}

function detectMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return null;
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>("unknown");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeType = detectMimeType();

  // Watch for permission changes
  useEffect(() => {
    if (!navigator.permissions) return;
    let permResult: PermissionStatus;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        permResult = result;
        setPermissionState(result.state as PermissionState);
        result.addEventListener("change", () => {
          setPermissionState(result.state as PermissionState);
        });
      })
      .catch(() => {});
    return () => {
      permResult?.removeEventListener("change", () => {});
    };
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (!mimeType) {
      setError("Your browser does not support audio recording.");
      setPermissionState("unavailable");
      return;
    }

    setError(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setPermissionState("denied");
          setError("Microphone access denied.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setPermissionState("unavailable");
          setError("No microphone found.");
        } else {
          setError(`Microphone error: ${err.message}`);
        }
      } else {
        setError("Could not access microphone.");
      }
      return;
    }

    setPermissionState("granted");
    streamRef.current = stream;
    setMediaStream(stream);

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordingBlob(blob);
      stream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
      streamRef.current = null;
      setIsRecording(false);
    };

    recorder.start(100); // 100ms timeslices
    setIsRecording(true);
  }, [mimeType]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  return { start, stop, recordingBlob, mimeType, isRecording, permissionState, mediaStream, error };
}
