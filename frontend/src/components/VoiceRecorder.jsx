import { useRef, useState, useEffect, useCallback } from "react";

export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession,
  cameraOn,
  onToggleCamera,
  autoStart,
}) {
  const [micReady, setMicReady]       = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted]         = useState(false);
  const [micError, setMicError]       = useState("");
  const [volume, setVolume]           = useState(0);

  const streamRef    = useRef(null);
  const audioCtxRef  = useRef(null);
  const processorRef = useRef(null);
  const sourceRef    = useRef(null);
  const analyserRef  = useRef(null);
  const animFrameRef = useRef(null);
  const pcmBufferRef = useRef([]);
  const intervalRef  = useRef(null);
  const isMutedRef   = useRef(false);
  const autoStartedRef = useRef(false);

  // Request mic with echo cancellation + noise suppression
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
    })
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
      doStop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Auto-start when session is ready
  useEffect(() => {
    if (autoStart && micReady && !isRecording && !autoStartedRef.current) {
      autoStartedRef.current = true;
      doStart();
    }
  }, [autoStart, micReady]);

  const float32ToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view   = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  };

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

  const flushBufferRef = useRef(null);
  flushBufferRef.current = () => {
    if (pcmBufferRef.current.length === 0) return;
    const totalLen = pcmBufferRef.current.reduce((acc, cur) => acc + cur.length, 0);
    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of pcmBufferRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmBufferRef.current = [];

    if (isMutedRef.current) {
      // Send silence so ElevenLabs keeps the connection alive but ignores input
      const silence = new Uint8Array(combined.length * 2);
      onAudioReady?.(new Blob([silence], { type: "audio/pcm" }));
    } else {
      const pcm = float32ToPCM16(combined);
      onAudioReady?.(new Blob([pcm], { type: "audio/pcm" }));
    }
  };

  const doStart = useCallback(() => {
    if (!streamRef.current || audioCtxRef.current) return;

    // Use 16000 Hz so browser handles resampling — no manual downsampling needed
    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(streamRef.current);
    sourceRef.current = source;

    // Analyser for the volume meter only
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      // AudioContext is at 16000 Hz so input is already the right rate
      const input = e.inputBuffer.getChannelData(0);
      pcmBufferRef.current.push(new Float32Array(input));
    };

    source.connect(processor);
    // *** Connect to a silent MediaStreamDestination — NOT ctx.destination ***
    // Connecting to ctx.destination would play the mic back through speakers
    // causing a feedback loop that destroys ElevenLabs STT quality.
    const silentDest = ctx.createMediaStreamDestination();
    processor.connect(silentDest);
    processorRef.current = processor;

    intervalRef.current = setInterval(() => flushBufferRef.current?.(), 250);
    setIsRecording(true);
    startVolumeLoop();
  }, []);

  const doStop = useCallback(() => {
    clearInterval(intervalRef.current);
    cancelAnimationFrame(animFrameRef.current);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    processorRef.current  = null;
    sourceRef.current     = null;
    audioCtxRef.current   = null;
    pcmBufferRef.current  = [];
    setIsRecording(false);
    setIsMuted(false);
    isMutedRef.current = false;
    setVolume(0);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
  }, []);

  const handleStartStop = useCallback(() => {
    if (isRecording) {
      doStop();
      autoStartedRef.current = false;
    } else {
      doStart();
    }
  }, [isRecording, doStart, doStop]);

  const bars        = [0.4, 0.7, 1.0, 0.8, 0.6, 0.9, 0.5, 0.75, 0.45];
  const volumeScale = Math.min(1, volume / 50);

  const statusText = micError
    ? micError
    : !micReady
      ? "Requesting microphone…"
      : isRecording
        ? isMuted
          ? "Muted — click unmute to speak"
          : isAvatarSpeaking
            ? "AI speaking…"
            : "Listening — speak now"
        : status || "Press Start to begin";

  const micColor = isRecording && !isMuted && !isAvatarSpeaking ? "#6c63ff" : "#f7971e";

  return (
    <div style={{
      background: "var(--surface2)",
      borderTop: "1px solid var(--border)",
      padding: "1rem 1.25rem",
      display: "flex", alignItems: "center", gap: "0.85rem",
      flexShrink: 0,
    }}>
      {/* Volume / mic visualiser */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, height: 32, minWidth: 60 }}>
        {isRecording && !isMuted
          ? bars.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                background: micColor,
                height: `${h * volumeScale * 28 + 4}px`,
                transition: "height 0.1s ease", opacity: 0.85,
              }} />
            ))
          : <div style={{
              fontSize: "1.4rem",
              opacity: isMuted ? 0.3 : micReady ? 0.5 : 0.2,
              filter: isMuted ? "grayscale(1)" : "none",
            }}>🎙</div>
        }
      </div>

      {/* Status text */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "0.8rem", lineHeight: 1.4,
          color: micError
            ? "#ff6584"
            : isMuted
              ? "#f7971e"
              : isRecording && !isAvatarSpeaking
                ? "#6c63ff"
                : "var(--text-muted)",
          fontWeight: isRecording ? 600 : 400,
        }}>
          {statusText}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {/* Camera toggle */}
        <button
          onClick={onToggleCamera}
          title={cameraOn ? "Turn camera off" : "Turn camera on"}
          style={{
            width: 38, height: 38, borderRadius: "10px",
            border: `1.5px solid ${cameraOn ? "rgba(67,233,123,0.5)" : "var(--border)"}`,
            background: cameraOn ? "rgba(67,233,123,0.1)" : "var(--surface)",
            color: cameraOn ? "#43e97b" : "var(--text-muted)",
            fontSize: "1rem", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s ease", flexShrink: 0,
          }}
        >
          {cameraOn ? "📷" : "📷"}
        </button>

        {/* Mute/Unmute (only visible when recording) */}
        {isRecording && (
          <button
            onClick={toggleMute}
            title={isMuted ? "Unmute mic" : "Mute mic"}
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              padding: "0.5rem 0.85rem",
              background: isMuted ? "rgba(247,151,30,0.15)" : "rgba(108,99,255,0.1)",
              border: `1.5px solid ${isMuted ? "rgba(247,151,30,0.5)" : "rgba(108,99,255,0.3)"}`,
              borderRadius: "10px",
              color: isMuted ? "#f7971e" : "#6c63ff",
              fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
              fontFamily: "var(--font-body)", flexShrink: 0,
              transition: "all 0.2s ease",
            }}
          >
            {isMuted ? "🔇 Unmute" : "🎤 Mute"}
          </button>
        )}

        {/* Start / Stop */}
        {!isRecording ? (
          <button
            onClick={handleStartStop}
            disabled={!micReady || !!micError}
            style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              padding: "0.55rem 1.1rem",
              background: micReady && !micError
                ? "linear-gradient(135deg,#6c63ff,#9c55ff)"
                : "var(--surface)",
              border: "none", borderRadius: "10px",
              color: micReady && !micError ? "#fff" : "var(--text-muted)",
              fontWeight: 700, fontSize: "0.82rem",
              cursor: micReady && !micError ? "pointer" : "not-allowed",
              boxShadow: micReady && !micError ? "0 4px 16px rgba(108,99,255,0.4)" : "none",
              transition: "all 0.2s ease", fontFamily: "var(--font-body)", flexShrink: 0,
            }}
          >
            <span>🎤</span> Start
          </button>
        ) : (
          <button
            onClick={handleStartStop}
            style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              padding: "0.55rem 1.1rem",
              background: "rgba(255,101,132,0.12)",
              border: "1.5px solid rgba(255,101,132,0.45)",
              borderRadius: "10px", color: "#ff6584",
              fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              animation: "recPulse 1.4s ease-in-out infinite",
              fontFamily: "var(--font-body)", flexShrink: 0,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#ff6584", display: "inline-block", flexShrink: 0,
            }} />
            Stop
          </button>
        )}

        {/* End Session */}
        <button
          onClick={onEndSession}
          style={{
            padding: "0.5rem 0.9rem",
            background: "transparent",
            border: "1px solid rgba(255,101,132,0.3)",
            borderRadius: "8px",
            color: "rgba(255,101,132,0.8)", cursor: "pointer",
            fontSize: "0.75rem", fontWeight: 600,
            fontFamily: "var(--font-body)", flexShrink: 0,
            transition: "all 0.2s ease",
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = "rgba(255,101,132,0.1)";
            e.currentTarget.style.borderColor = "rgba(255,101,132,0.6)";
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(255,101,132,0.3)";
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
