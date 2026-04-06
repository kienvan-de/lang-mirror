import { useState, useRef, useCallback } from "react";

const DEFAULT_VOICES: Record<string, string> = {
  en: "en-US-JennyNeural",
  ja: "ja-JP-NanamiNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ko: "ko-KR-SunHiNeural",
  pt: "pt-BR-FranciscaNeural",
  it: "it-IT-ElsaNeural",
  ru: "ru-RU-SvetlanaNeural",
};

export function defaultVoiceForLang(langCode: string): string {
  const base = langCode.split("-")[0]!.toLowerCase();
  return DEFAULT_VOICES[base] ?? "en-US-JennyNeural";
}

export interface TTSOptions {
  text: string;
  voice: string;
  speed?: number;
  pitch?: number;
}

export interface UseTTSReturn {
  play: (opts: TTSOptions) => Promise<number>; // resolves with duration in seconds
  stop: () => void;
  isLoading: boolean;
  isPlaying: boolean;
  duration: number | null;
  error: string | null;
}

export function useTTS(): UseTTSReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  const play = useCallback(async (opts: TTSOptions): Promise<number> => {
    stop();
    setError(null);
    setIsLoading(true);

    const params = new URLSearchParams({
      text: opts.text,
      voice: opts.voice,
      speed: String(opts.speed ?? 1.0),
      pitch: String(opts.pitch ?? 0),
    });

    const url = `/api/tts?${params.toString()}`;

    return new Promise<number>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("canplaythrough", () => {
        setIsLoading(false);
        setIsPlaying(true);
        setDuration(audio.duration || null);
        audio.play().catch((err) => {
          setIsPlaying(false);
          setIsLoading(false);
          setError("Playback failed");
          reject(err);
        });
      }, { once: true });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        audioRef.current = null;
        resolve(audio.duration ?? 0);
      }, { once: true });

      audio.addEventListener("error", () => {
        setIsLoading(false);
        setIsPlaying(false);
        const msg = "Failed to load TTS audio";
        setError(msg);
        audioRef.current = null;
        reject(new Error(msg));
      }, { once: true });

      // Start loading
      audio.load();
    });
  }, [stop]);

  return { play, stop, isLoading, isPlaying, duration, error };
}
