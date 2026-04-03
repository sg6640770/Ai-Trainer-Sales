import { useRef, useState, useEffect, useCallback } from "react";

export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession,
  cameraOn,
  onToggleCamera,
}) {
  const [micReady, setMicReady]       = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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

  const TARGET_SR = 16000;

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
  }, []);

  const float32ToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view   = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  };

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

  const flushBuffer = useCallback(() => {
    if (pcmBufferRef.current.length === 0) return;
    const totalLen = pcmBufferRef.current.reduce((acc, cur) => acc + cur.length, 0);
    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of pcmBufferRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmBufferRef.current = [];
    const pcm = float32ToPCM16(combined);
    onAudioReady?.(new Blob([pcm], { type: "audio/pcm" }));
  }, [onAudioReady]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    const ctx      = new AudioContext();
    const nativeSR = ctx.sampleRate;
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(streamRef.current);
    sourceRef.current = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const input     = e.inputBuffer.getChannelData(0);
      const resampled = downsample(input, nativeSR, TARGET_SR);
      pcmBufferRef.current.push(new Float32Array(resampled));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    processorRef.current = processor;

    intervalRef.current = setInterval(flushBuffer, 250);
    setIsRecording(true);
    startVolumeLoop();
  }, [isRecording, flushBuffer]);

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

  const bars        = [0.4, 0.7, 1.0, 0.8, 0.6, 0.9, 0.5, 0.75, 0.45];
  const volumeScale = Math.min(1, volume / 60);

  const statusText = micError
    ? micError
    : !micReady
      ? "Requesting microphone…"
      : isRecording
        ? isAvatarSpeaking
          ? "AI speaking…"
          : "Recording — speak now"
        : status || "Press Start to speak";

  return (
    <div style={{
      background: "var(--surface2)",
      borderTop: "1px solid var(--border)",
      padding: "1rem 1.25rem",
      display: "flex", alignItems: "center", gap: "0.85rem",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, height: 32, minWidth: 60 }}>
        {isRecording
          ? bars.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                background: isAvatarSpeaking ? "#f7971e" : "#6c63ff",
                height: `${h * volumeScale * 28 + 4}px`,
                transition: "height 0.1s ease", opacity: 0.85,
              }} />
            ))
          : <div style={{ fontSize: "1.4rem", opacity: micReady ? 0.5 : 0.25 }}>🎙</div>
        }
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "0.8rem", lineHeight: 1.4,
          color: micError ? "#ff6584" : isRecording && !isAvatarSpeaking ? "#6c63ff" : "var(--text-muted)",
          fontWeight: isRecording ? 600 : 400,
        }}>
          {statusText}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
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
            transition: "all 0.2s ease",
            flexShrink: 0,
          }}
        >
          {cameraOn ? "📷" : "📷"}
        </button>

        {!isRecording ? (
          <button
            onClick={startRecording}
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
              transition: "all 0.2s ease",
              fontFamily: "var(--font-body)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>🎤</span> Start
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              padding: "0.55rem 1.1rem",
              background: "rgba(255,101,132,0.12)",
              border: "1.5px solid rgba(255,101,132,0.45)",
              borderRadius: "10px", color: "#ff6584",
              fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              animation: "recPulse 1.4s ease-in-out infinite",
              fontFamily: "var(--font-body)",
              flexShrink: 0,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#ff6584", display: "inline-block", flexShrink: 0,
            }} />
            Stop
          </button>
        )}

        <button
          onClick={onEndSession}
          title="End this session"
          style={{
            padding: "0.5rem 0.9rem",
            background: "transparent",
            border: "1px solid rgba(255,101,132,0.3)",
            borderRadius: "8px",
            color: "rgba(255,101,132,0.8)", cursor: "pointer",
            fontSize: "0.75rem", fontWeight: 600,
            fontFamily: "var(--font-body)",
            transition: "all 0.2s ease",
            flexShrink: 0,
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
