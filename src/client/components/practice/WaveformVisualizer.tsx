import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  isActive: boolean;
}

export function WaveformVisualizer({ stream, isActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawFlat = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(156,163,175,0.3)"; // gray-400/30
      const y = canvas.height / 2;
      ctx.fillRect(0, y - 1, canvas.width, 2);
    };

    if (!isActive || !stream) {
      cancelAnimationFrame(rafRef.current);
      // Tear down audio context if it was active
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      drawFlat();
      return;
    }

    // Set up Web Audio API
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = ((dataArray[i] ?? 0) / 255) * canvas.height;
        const intensity = (dataArray[i] ?? 0) / 255;

        // Red → pink gradient based on intensity
        const r = Math.round(220 + (255 - 220) * (1 - intensity));
        const g = Math.round(38 * (1 - intensity));
        const b = Math.round(38 * (1 - intensity));

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioCtx.close().catch(() => {});
    };
  }, [stream, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={48}
      className="w-full h-12 rounded-lg bg-gray-900/5 dark:bg-white/5"
      aria-hidden="true"
    />
  );
}
