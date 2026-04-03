import { useRef, useState, useEffect, useCallback } from "react";

/**
 * VoiceRecorder
 *
 * Captures mic audio, resamples to PCM 16000 Hz mono 16-bit (what ElevenLabs
 * ConvAI expects), and streams 250ms chunks to the parent via onAudioReady.
 *
 * Does NOT own the WebSocket — that lives in App.jsx.
 */
export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession
}) {
  const [micReady, setMicReady]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError]     = useState("");
  const [volume, setVolume]         = useState(0);

  const streamRef       = useRef(null);
  const audioCtxRef     = useRef(null);
  const processorRef    = useRef(null);
  const sourceRef       = useRef(null);
  const analyserRef     = useRef(null);
  const animFrameRef    = useRef(null);
  const pcmBufferRef    = useRef([]);   // accumulate Float32 samples
  const intervalRef     = useRef(null);

  const TARGET_SR = 16000; // ElevenLabs requires 16 kHz PCM

  // ── Request mic on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        setMicReady(true);
      })
      .catch(err => {
        if (!active) return;
        console.error("Mic error:", err);
        setMicError("Microphone access denied. Please allow mic and reload.");
      });
    return () => {
      active = false;
      stopRecording();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line

  // ── Float32 → Int16 PCM conversion ─────────────────────────────────────────
  const float32ToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view   = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  };

  // ── Downsample from native SR → 16000 ──────────────────────────────────────
  const downsample = (buffer, fromSR, toSR) => {
    if (fromSR === toSR) return buffer;
    const ratio  = fromSR / toSR;
    const length = Math.round(buffer.length / ratio);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = buffer[Math.round(i * ratio)];
    }
    return result;
  };

  // ── Volume animation ────────────────────────────────────────────────────────
  const startVolumeLoop = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(avg);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  };

  // ── Flush PCM buffer → send chunk ──────────────────────────────────────────
  const flushBuffer = useCallback(() => {
    if (pcmBufferRef.current.length === 0) return;
    const combined = new Float32Array(
      pcmBufferRef.current.reduce((acc, cur) => acc + cur.length, 0)
    );
    let offset = 0;
    for (const chunk of pcmBufferRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmBufferRef.current = [];

    const pcm = float32ToPCM16(combined);
    onAudioReady?.(new Blob([pcm], { type: "audio/pcm" }));
  }, [onAudioReady]);

  // ── Start recording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    // AudioContext at native rate; we'll downsample manually
    const ctx      = new AudioContext();
    const nativeSR = ctx.sampleRate;
    audioCtxRef.current = ctx;

    const source   = ctx.createMediaStreamSource(streamRef.current);
    sourceRef.current = source;

    // Analyser for volume meter
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    // ScriptProcessor to grab raw PCM (deprecated but universally supported)
    const bufferSize = 4096;
    const processor  = ctx.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (e) => {
      const input      = e.inputBuffer.getChannelData(0);
      const resampled  = downsample(input, nativeSR, TARGET_SR);
      pcmBufferRef.current.push(new Float32Array(resampled));
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    processorRef.current = processor;

    // Flush every 250 ms
    intervalRef.current = setInterval(flushBuffer, 250);

    setIsRecording(true);
    startVolumeLoop();
  }, [isRecording, flushBuffer]);

  // ── Stop recording ──────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    clearInterval(intervalRef.current);
    cancelAnimationFrame(animFrameRef.current);

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();

    processorRef.current = null;
    sourceRef.current    = null;
    audioCtxRef.current  = null;
    pcmBufferRef.current = [];

    setIsRecording(false);
    setVolume(0);
  }, []);

  // ── Waveform bars ───────────────────────────────────────────────────────────
  const bars        = [0.4, 0.7, 1.0, 0.8, 0.6, 0.9, 0.5, 0.75, 0.45];
  const volumeScale = Math.min(1, volume / 60);

  return (
    <div style={{
      background: "var(--surface2)",
      borderTop: "1px solid var(--border)",
      padding: "1rem 1.25rem",
      display: "flex", alignItems: "center", gap: "1rem",
      flexShrink: 0
    }}>

      {/* Waveform / mic icon */}
      <div style={{ display:"flex", alignItems:"center", gap:3, height:32, minWidth:64 }}>
        {isRecording
          ? bars.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                background: isAvatarSpeaking ? "#f7971e" : "#6c63ff",
                height: `${h * volumeScale * 28 + 4}px`,
                transition: "height 0.1s ease", opacity: 0.85
              }} />
            ))
          : <div style={{ fontSize:"1.4rem", opacity: micReady ? 0.5 : 0.25 }}>🎙</div>
        }
      </div>

      {/* Status */}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:"0.8rem", color:"var(--text-muted)", lineHeight:1.4 }}>
          {micError
            ? <span style={{ color:"#ff6584" }}>{micError}</span>
            : !micReady
              ? "Requesting microphone…"
              : isRecording
                ? isAvatarSpeaking
                  ? "🟡 AI speaking — listening paused"
                  : "🔴 Recording — speak now"
                : (status || "Press Start to speak")}
        </div>
      </div>

      {/* Start / Stop buttons */}
      <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={!micReady || !!micError}
            style={{
              display:"flex", alignItems:"center", gap:"0.45rem",
              padding:"0.55rem 1.1rem",
              background: micReady && !micError
                ? "linear-gradient(135deg,#6c63ff,#9c55ff)"
                : "var(--surface)",
              border:"none", borderRadius:"10px",
              color: micReady && !micError ? "#fff" : "var(--text-muted)",
              fontWeight:700, fontSize:"0.82rem",
              cursor: micReady && !micError ? "pointer" : "not-allowed",
              boxShadow: micReady && !micError ? "0 4px 16px rgba(108,99,255,0.4)" : "none",
              transition:"all 0.2s ease", fontFamily:"var(--font-body)"
            }}
          >
            <span>▶</span> Start
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              display:"flex", alignItems:"center", gap:"0.45rem",
              padding:"0.55rem 1.1rem",
              background:"rgba(255,101,132,0.15)",
              border:"1.5px solid rgba(255,101,132,0.45)",
              borderRadius:"10px", color:"#ff6584",
              fontWeight:700, fontSize:"0.82rem", cursor:"pointer",
              animation:"recPulse 1.4s ease-in-out infinite",
              fontFamily:"var(--font-body)"
            }}
          >
            <span style={{
              width:9, height:9, borderRadius:"50%",
              background:"#ff6584", display:"inline-block", flexShrink:0
            }} />
            Stop
          </button>
        )}

        <button
          onClick={onEndSession}
          style={{
            background:"transparent",
            border:"1px solid rgba(255,101,132,0.25)",
            borderRadius:"8px", padding:"0.45rem 0.85rem",
            color:"rgba(255,101,132,0.7)", cursor:"pointer",
            fontSize:"0.75rem", fontWeight:600, fontFamily:"var(--font-body)"
          }}
        >
          End Session
        </button>
      </div>

      <style>{`
        @keyframes recPulse {
          0%,100%{box-shadow:0 0 0 0 rgba(255,101,132,0.35);}
          50%    {box-shadow:0 0 0 6px rgba(255,101,132,0);}
        }
      `}</style>
    </div>
  );
}