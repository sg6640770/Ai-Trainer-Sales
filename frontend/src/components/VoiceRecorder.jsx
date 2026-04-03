import { useRef, useState, useEffect, useCallback } from "react";

// Lowered threshold — adjust based on debug output you see
const SPEECH_THRESHOLD   = 0.003;  // very sensitive — catches quiet voices
const SILENCE_TIMEOUT_MS = 1000;   // 1 second silence = end of utterance
const MIN_SPEECH_MS      = 150;    // ignore noise bursts under 150ms

export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession,
  cameraOn,
  onToggleCamera,
}) {
  const [micActive,  setMicActive]  = useState(false);
  const [micMuted,   setMicMuted]   = useState(false);
  const [micError,   setMicError]   = useState("");
  const [started,    setStarted]    = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [rmsDebug,   setRmsDebug]   = useState(0); // shows live RMS

  const streamRef          = useRef(null);
  const audioCtxRef        = useRef(null);
  const processorRef       = useRef(null);
  const sourceRef          = useRef(null);
  const destRef            = useRef(null);
  const animFrameRef       = useRef(null);
  const analyserRef        = useRef(null);
  const volumeRef          = useRef(0);

  const speechBufferRef    = useRef([]);
  const isSpeakingRef      = useRef(false);
  const silenceTimerRef    = useRef(null);
  const speechStartRef     = useRef(null);

  const micMutedRef           = useRef(false);
  const isAvatarSpeakingRef   = useRef(false);
  const onAudioRef            = useRef(onAudioReady);
  onAudioRef.current          = onAudioReady;
  isAvatarSpeakingRef.current = isAvatarSpeaking;

  function toPCM16(f32Array) {
    const buf  = new ArrayBuffer(f32Array.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < f32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, f32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  function getRMS(f32) {
    let sum = 0;
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    return Math.sqrt(sum / f32.length);
  }

  function flushSpeechBuffer() {
    const chunks = speechBufferRef.current.splice(0);
    if (!chunks.length) return;
    const total  = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    const bytes = toPCM16(merged);
    const durationSec = (total / 16000).toFixed(2);
    console.log(`✅ Sending speech: ${durationSec}s | ${bytes.length} bytes`);
    onAudioRef.current?.(bytes.buffer);
  }

  function processChunk(f32) {
    if (micMutedRef.current) return;
    if (isAvatarSpeakingRef.current) return;

    const rms    = getRMS(f32);
    const talking = rms > SPEECH_THRESHOLD;

    // Update debug display every chunk
    setRmsDebug(rms);

    if (talking) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      if (!isSpeakingRef.current) {
        isSpeakingRef.current  = true;
        speechStartRef.current = Date.now();
        speechBufferRef.current = [];
        setIsSpeaking(true);
        console.log(`🎤 Speech start | RMS: ${rms.toFixed(5)}`);
      }
      speechBufferRef.current.push(new Float32Array(f32));

    } else {
      if (isSpeakingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          const duration = Date.now() - (speechStartRef.current || 0);
          if (duration >= MIN_SPEECH_MS) {
            flushSpeechBuffer();
          } else {
            speechBufferRef.current = [];
            console.log("⚠️ Discarded noise burst <", MIN_SPEECH_MS, "ms");
          }
          isSpeakingRef.current   = false;
          silenceTimerRef.current = null;
          setIsSpeaking(false);
        }, SILENCE_TIMEOUT_MS);
      }

      if (isSpeakingRef.current) {
        speechBufferRef.current.push(new Float32Array(f32));
      }
    }
  }

  function startVolumeMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      volumeRef.current = avg;
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  const startMic = useCallback(async () => {
    if (started) return;
    setStarted(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
          channelCount:     1,
        },
        video: false,
      });
    } catch (err) {
      console.error("Mic error:", err);
      setMicError("Mic access denied — check browser permissions");
      return;
    }

    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") await ctx.resume();
    console.log("AudioContext state:", ctx.state, "| sampleRate:", ctx.sampleRate);

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (e) => {
      processChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);

    const silentDest = ctx.createMediaStreamDestination();
    destRef.current  = silentDest;
    processor.connect(silentDest);
    processorRef.current = processor;

    startVolumeMeter();
    setMicActive(true);
    console.log("✅ Mic started — VAD threshold:", SPEECH_THRESHOLD);
    console.log("📊 Open console to watch RMS values when you speak");
  }, [started]);

  useEffect(() => {
    return () => {
      clearTimeout(silenceTimerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
      destRef.current = null;
    };
  }, []);

  function toggleMute() {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  }

  const bars = [0.3, 0.6, 1.0, 0.7, 0.5, 0.85, 0.45, 0.7, 0.35];
  const volumeScale = Math.min(1, volumeRef.current / 45);

  const callStatus = micError     ? micError
    : !started                    ? "Click 🎤 to begin"
    : !micActive                  ? "Connecting…"
    : micMuted                    ? "Mic muted"
    : isAvatarSpeaking            ? "AI speaking…"
    : isSpeaking                  ? "● Listening…"
    : "Speak now";

  const statusColor = micError    ? "#ff6584"
    : !started                    ? "var(--text-muted)"
    : micMuted                    ? "#f7971e"
    : isAvatarSpeaking            ? "#f7971e"
    : isSpeaking                  ? "#43e97b"
    : micActive                   ? "#6c63ff"
    : "var(--text-muted)";

  // RMS bar width — shows how loud you are vs threshold
  const rmsPercent  = Math.min(100, (rmsDebug / 0.05) * 100);
  const thresholdPx = Math.min(100, (SPEECH_THRESHOLD / 0.05) * 100);

  return (
    <div style={{
      background: "linear-gradient(180deg, #0a0a14 0%, #080810 100%)",
      borderTop: "1px solid var(--border)",
      padding: "0.75rem 1.5rem",
      display: "flex", flexDirection: "column",
      gap: "0.5rem", flexShrink: 0,
    }}>

      {/* RMS debug bar — visible while mic is active */}
      {micActive && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", whiteSpace: "nowrap", width: 60 }}>
            Mic level
          </span>
          <div style={{
            flex: 1, height: 6, borderRadius: 3,
            background: "var(--border)", position: "relative", overflow: "hidden"
          }}>
            {/* RMS fill */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${rmsPercent}%`,
              background: isSpeaking
                ? "linear-gradient(90deg, #43e97b, #38f9d7)"
                : "linear-gradient(90deg, #6c63ff, #9c55ff)",
              borderRadius: 3,
              transition: "width 0.05s ease"
            }} />
            {/* Threshold line */}
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${thresholdPx}%`,
              width: 2, background: "#ff6584",
              opacity: 0.8
            }} />
          </div>
          <span style={{
            fontSize: "0.6rem",
            color: isSpeaking ? "#43e97b" : "var(--text-muted)",
            width: 50, textAlign: "right", fontWeight: 600
          }}>
            {isSpeaking ? "SPEAKING" : rmsDebug.toFixed(4)}
          </span>
        </div>
      )}

      {/* Main toolbar row */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "1rem"
      }}>

        {/* Left — indicator + waveform + status */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 180 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: micError   ? "#ff6584"
              : !started           ? "#333"
              : micMuted           ? "#f7971e"
              : isSpeaking         ? "#43e97b"
              : micActive          ? "#6c63ff"
              : "#333",
            boxShadow: isSpeaking
              ? "0 0 0 3px rgba(67,233,123,0.25), 0 0 12px rgba(67,233,123,0.5)"
              : micActive && started
                ? "0 0 0 3px rgba(108,99,255,0.15)"
                : "none",
            animation: isSpeaking ? "livePulse 1s ease-in-out infinite" : "none",
            transition: "all 0.2s ease"
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 26 }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                background: isSpeaking
                  ? "rgba(67,233,123,0.8)"
                  : micMuted ? "rgba(247,151,30,0.3)"
                  : micActive ? "rgba(108,99,255,0.45)"
                  : "rgba(255,255,255,0.07)",
                height: isSpeaking
                  ? `${h * volumeScale * 22 + 3}px`
                  : micActive ? "4px" : "3px",
                transition: "height 0.08s ease, background 0.2s ease",
              }} />
            ))}
          </div>

          <span style={{
            fontSize: "0.78rem", fontWeight: 600,
            color: statusColor, whiteSpace: "nowrap"
          }}>
            {callStatus}
          </span>
        </div>

        {/* Centre — buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>

          {!started ? (
            <button onClick={startMic} style={{
              width: 54, height: 54, borderRadius: "50%",
              border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, var(--accent), #9c55ff)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.5rem",
              boxShadow: "0 4px 24px rgba(108,99,255,0.55)",
              animation: "glowPulse 2s ease-in-out infinite",
            }} title="Start mic">
              🎤
            </button>
          ) : (
            <button onClick={toggleMute} style={{
              width: 46, height: 46, borderRadius: "50%",
              border: "none", cursor: "pointer",
              background: micMuted ? "rgba(247,151,30,0.2)" : "rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem", transition: "all 0.2s ease",
              outline: micMuted ? "2px solid rgba(247,151,30,0.5)" : "none",
            }} title={micMuted ? "Unmute" : "Mute"}>
              {micMuted ? "🔇" : "🎤"}
            </button>
          )}

          <button onClick={onToggleCamera} style={{
            width: 46, height: 46, borderRadius: "50%",
            border: "none", cursor: "pointer",
            background: cameraOn ? "rgba(67,233,123,0.15)" : "rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.2rem", transition: "all 0.2s ease",
            outline: cameraOn ? "2px solid rgba(67,233,123,0.4)" : "none",
          }} title={cameraOn ? "Camera off" : "Camera on"}>
            📷
          </button>
        </div>

        {/* Right — End Session */}
        <button onClick={onEndSession} style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.65rem 1.4rem",
          background: "linear-gradient(135deg, #ff3b3b, #cc1a1a)",
          border: "none", borderRadius: "24px",
          color: "#fff", fontWeight: 700, fontSize: "0.85rem",
          cursor: "pointer", fontFamily: "var(--font-body)",
          boxShadow: "0 4px 20px rgba(255,59,59,0.4)",
          transition: "all 0.2s ease",
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
          <span>📵</span> End Session
        </button>
      </div>

      <style>{`
        @keyframes livePulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.5; transform:scale(1.4); }
        }
        @keyframes glowPulse {
          0%,100% { box-shadow: 0 4px 20px rgba(108,99,255,0.5); }
          50%      { box-shadow: 0 4px 36px rgba(108,99,255,0.85); }
        }
      `}</style>
    </div>
  );
}