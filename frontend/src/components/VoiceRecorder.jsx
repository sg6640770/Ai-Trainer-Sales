import { useRef, useState, useEffect } from "react";

/**
 * CallToolbar
 *
 * Mic streams CONTINUOUSLY from mount — exactly like a phone/video call.
 * No Start/Stop recording buttons. The user just speaks naturally.
 * ElevenLabs ConvAI handles VAD, echo cancellation, and turn-taking.
 *
 * Controls visible: mic mute toggle (icon) | camera toggle (icon) | End Session
 */
export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession,
  cameraOn,
  onToggleCamera,
}) {
  const [micActive, setMicActive] = useState(false);
  const [micMuted,  setMicMuted]  = useState(false);
  const [micError,  setMicError]  = useState("");
  const [volume,    setVolume]    = useState(0);

  const streamRef    = useRef(null);
  const audioCtxRef  = useRef(null);
  const processorRef = useRef(null);
  const sourceRef    = useRef(null);
  const analyserRef  = useRef(null);
  const animFrameRef = useRef(null);
  const intervalRef  = useRef(null);
  const pcmBufferRef = useRef([]);
  const micMutedRef  = useRef(false);
  const onAudioRef   = useRef(onAudioReady);
  onAudioRef.current = onAudioReady;

  // ── Float32 → PCM16 ──────────────────────────────────────────────────────
  function toPCM16(f32) {
    const buf  = new ArrayBuffer(f32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  // ── Volume meter loop ─────────────────────────────────────────────────────
  function startVolumeMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(avg);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Flush PCM buffer → WebSocket ─────────────────────────────────────────
  function flush() {
    if (!pcmBufferRef.current.length) return;
    const total   = pcmBufferRef.current.reduce((s, c) => s + c.length, 0);
    const merged  = new Float32Array(total);
    let off = 0;
    for (const c of pcmBufferRef.current) { merged.set(c, off); off += c.length; }
    pcmBufferRef.current = [];

    const bytes = micMutedRef.current
      ? new Uint8Array(total * 2)   // silence while muted — keeps ElevenLabs alive
      : toPCM16(merged);

    onAudioRef.current?.(new Blob([bytes], { type: "audio/pcm" }));
  }

  // ── Start streaming on mount ──────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      },
      video: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      // AudioContext at 16 kHz — browser resamples natively, no manual downsampling
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        pcmBufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      // ★ Connect to a SILENT destination — NOT ctx.destination
      //   Connecting to ctx.destination plays mic back through speakers
      //   and creates a feedback loop that wrecks ElevenLabs STT.
      processor.connect(ctx.createMediaStreamDestination());
      processorRef.current = processor;

      intervalRef.current = setInterval(flush, 250);
      startVolumeMeter();
      setMicActive(true);

    }).catch(err => {
      if (!active) return;
      console.error("Mic error:", err);
      setMicError("Mic access denied");
    });

    return () => {
      active = false;
      clearInterval(intervalRef.current);
      cancelAnimationFrame(animFrameRef.current);
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  function toggleMute() {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
  }

  // ── Derived display ───────────────────────────────────────────────────────
  const bars        = [0.3, 0.6, 1.0, 0.7, 0.5, 0.85, 0.45, 0.7, 0.35];
  const volumeScale = Math.min(1, volume / 45);

  const callStatus = micError
    ? micError
    : !micActive
      ? "Connecting mic…"
      : micMuted
        ? "Mic muted"
        : isAvatarSpeaking
          ? "AI speaking…"
          : "Live — speak now";

  const statusColor = micError
    ? "#ff6584"
    : micMuted
      ? "#f7971e"
      : isAvatarSpeaking
        ? "#f7971e"
        : micActive
          ? "#43e97b"
          : "var(--text-muted)";

  return (
    <div style={{
      background: "linear-gradient(180deg, #0a0a14 0%, #080810 100%)",
      borderTop: "1px solid var(--border)",
      padding: "0.85rem 1.5rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "1rem", flexShrink: 0,
    }}>

      {/* Left — live mic indicator + waveform */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 160 }}>
        {/* Pulsing live dot */}
        <div style={{
          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
          background: micError ? "#ff6584" : micMuted ? "#f7971e" : micActive ? "#43e97b" : "#444",
          boxShadow: micActive && !micMuted && !micError
            ? "0 0 0 3px rgba(67,233,123,0.2), 0 0 12px rgba(67,233,123,0.4)"
            : "none",
          animation: micActive && !micMuted && !isAvatarSpeaking ? "livePulse 2s ease-in-out infinite" : "none",
        }} />

        {/* Waveform bars */}
        <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 28 }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              width: 3, borderRadius: 2,
              background: micMuted ? "rgba(247,151,30,0.3)" : "rgba(108,99,255,0.7)",
              height: micActive && !micMuted
                ? `${h * volumeScale * 22 + 3}px`
                : "3px",
              transition: "height 0.1s ease",
            }} />
          ))}
        </div>

        {/* Status text */}
        <span style={{
          fontSize: "0.78rem", fontWeight: 600,
          color: statusColor, letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}>
          {callStatus}
        </span>
      </div>

      {/* Centre — icon controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {/* Mic mute */}
        <button
          onClick={toggleMute}
          title={micMuted ? "Unmute mic" : "Mute mic"}
          style={{
            width: 46, height: 46, borderRadius: "50%",
            border: "none", cursor: "pointer",
            background: micMuted
              ? "rgba(247,151,30,0.2)"
              : "rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.2rem", transition: "all 0.2s ease",
            outline: micMuted ? "2px solid rgba(247,151,30,0.5)" : "none",
          }}
        >
          {micMuted ? "🔇" : "🎤"}
        </button>

        {/* Camera toggle */}
        <button
          onClick={onToggleCamera}
          title={cameraOn ? "Turn camera off" : "Turn camera on"}
          style={{
            width: 46, height: 46, borderRadius: "50%",
            border: "none", cursor: "pointer",
            background: cameraOn
              ? "rgba(67,233,123,0.15)"
              : "rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.2rem", transition: "all 0.2s ease",
            outline: cameraOn ? "2px solid rgba(67,233,123,0.4)" : "none",
          }}
        >
          {cameraOn ? "📷" : "📷"}
        </button>
      </div>

      {/* Right — End Session */}
      <button
        onClick={onEndSession}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.65rem 1.4rem",
          background: "linear-gradient(135deg, #ff3b3b, #cc1a1a)",
          border: "none", borderRadius: "24px",
          color: "#fff", fontWeight: 700, fontSize: "0.85rem",
          cursor: "pointer", fontFamily: "var(--font-body)",
          boxShadow: "0 4px 20px rgba(255,59,59,0.4)",
          transition: "all 0.2s ease", letterSpacing: "0.02em",
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,59,59,0.55)";
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,59,59,0.4)";
        }}
      >
        <span style={{ fontSize: "1rem" }}>📵</span> End Session
      </button>

      <style>{`
        @keyframes livePulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
