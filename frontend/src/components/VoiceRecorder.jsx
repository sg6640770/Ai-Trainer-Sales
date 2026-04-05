import { useRef, useState, useEffect, useCallback } from "react";

const NATIVE_SR        = 48000;
const TARGET_SR        = 16000;
const MIC_GAIN         = 3.5;
const SPEECH_THRESHOLD = 0.008;

const DEBUG = true;
function log(emoji, label, ...args) {
  if (!DEBUG) return;
  console.log(`[${performance.now().toFixed(0)}ms] ${emoji} [VR] ${label}`, ...args);
}
function warn(label, ...args) {
  if (!DEBUG) return;
  console.warn(`⚠️ [VR] ${label}`, ...args);
}

export default function VoiceRecorder({
  onAudioReady,
  status,
  isAvatarSpeaking,
  onEndSession,
  cameraOn,
  onToggleCamera,
}) {
  const [micActive,  setMicActive]  = useState(false);
  const [micError,   setMicError]   = useState("");
  const [started,    setStarted]    = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [rmsDebug,   setRmsDebug]   = useState(0);

  const chunkCountRef    = useRef(0);
  const sentCountRef     = useRef(0);
  const blockedAvatarRef = useRef(0);

  const streamRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const processorRef  = useRef(null);
  const sourceRef     = useRef(null);
  const gainNodeRef   = useRef(null);
  const analyserRef   = useRef(null);
  const silentDestRef = useRef(null);
  const animFrameRef  = useRef(null);
  const volumeRef     = useRef(0);
  const cleanedUpRef  = useRef(false);

  const avatarSpeakingRef = useRef(false);
  const onAudioRef        = useRef(onAudioReady);
  onAudioRef.current      = onAudioReady;
  avatarSpeakingRef.current = isAvatarSpeaking;

  useEffect(() => {
    log("🤖", `isAvatarSpeaking → ${isAvatarSpeaking}`);
  }, [isAvatarSpeaking]);

  useEffect(() => {
    log("🔌", `onAudioReady: ${onAudioReady ? "PROVIDED ✅" : "MISSING ❌"}`);
  }, [onAudioReady]);

  function downsample(input) {
    const ratio  = NATIVE_SR / TARGET_SR;
    const outLen = Math.floor(input.length / ratio);
    const output = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx  = i * ratio;
      const lo   = Math.floor(idx);
      const hi   = Math.min(lo + 1, input.length - 1);
      const frac = idx - lo;
      output[i]  = input[lo] * (1 - frac) + input[hi] * frac;
    }
    return output;
  }

  function toPCM16(f32) {
    const buf  = new ArrayBuffer(f32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buf);
  }

  function getRMS(f32) {
    let sum = 0;
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    return Math.sqrt(sum / f32.length);
  }

  function processChunk(rawF32) {
    chunkCountRef.current += 1;
    const chunk = chunkCountRef.current;

    // Block mic while avatar is speaking — prevents echo loop
    if (avatarSpeakingRef.current) {
      blockedAvatarRef.current += 1;
      if (blockedAvatarRef.current % 100 === 1)
        warn(`AVATAR SPEAKING — ${blockedAvatarRef.current} chunks blocked`);
      setRmsDebug(0);
      setIsSpeaking(false);
      return;
    }

    const rms = getRMS(rawF32);
    setRmsDebug(rms);
    setIsSpeaking(rms > SPEECH_THRESHOLD);

    // Downsample to 16000Hz and convert to PCM16
    const resampled = downsample(rawF32);
    const pcmBytes  = toPCM16(resampled);

    if (!onAudioRef.current) {
      if (chunk % 100 === 1) warn("onAudioReady is NULL — audio discarded!");
      return;
    }

    // Send continuous PCM stream — ElevenLabs handles VAD internally
    onAudioRef.current(pcmBytes);
    sentCountRef.current += 1;

    if (sentCountRef.current % 50 === 1) {
      log("📤", `Chunk #${sentCountRef.current}`,
        `| RMS: ${rms.toFixed(5)}`,
        `| PCM: ${pcmBytes.byteLength}B`,
        `| avatarBlocked: ${blockedAvatarRef.current}`
      );
    }

    if (chunk === 100 && rms < 0.0001)
      warn("RMS near-zero after 100 chunks — check mic device or gain");
  }

  function startVolumeMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      volumeRef.current = data.reduce((a, b) => a + b, 0) / data.length;
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  const startMic = useCallback(async () => {
    if (started) return;
    setStarted(true);
    cleanedUpRef.current = false;
    log("🎤", "startMic called — continuous stream to ElevenLabs");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate:       { ideal: NATIVE_SR },
          channelCount:     1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
        video: false,
      });
      const track    = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      log("✅", "getUserMedia SUCCESS", {
        label:        track.label,
        sampleRate:   settings.sampleRate,
        channelCount: settings.channelCount,
      });
    } catch (err) {
      warn("getUserMedia FAILED:", err.name, err.message);
      setMicError("Mic permission denied");
      setStarted(false);
      return;
    }

    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: NATIVE_SR });
    audioCtxRef.current = ctx;
    await ctx.resume();
    log("🔊", `AudioContext — SR: ${ctx.sampleRate}, state: ${ctx.state}`);

    if (ctx.sampleRate !== NATIVE_SR)
      warn(`SR mismatch! Wanted ${NATIVE_SR}, got ${ctx.sampleRate}`);

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const gainNode = ctx.createGain();
    gainNode.gain.value = MIC_GAIN;
    gainNodeRef.current = gainNode;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      processChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    source.connect(gainNode);
    gainNode.connect(processor);

    // ✅ CRITICAL FIX: Connect to silent destination NOT ctx.destination
    // Connecting to ctx.destination = mic plays through speakers = echo loop
    // ElevenLabs hears its own voice back = wasted credits + confused agent
    const silentDest = ctx.createMediaStreamDestination();
    silentDestRef.current = silentDest;
    processor.connect(silentDest);

    log("🔗", "Chain: source → gain → processor → silentDest ✅ (no echo)");

    startVolumeMeter();
    setMicActive(true);
    log("✅", "Mic LIVE — streaming to ElevenLabs continuously");
  }, [started]);

  const doCleanup = useCallback(() => {
    if (cleanedUpRef.current) {
      log("🧹", "Cleanup skipped — already done");
      return;
    }
    cleanedUpRef.current = true;
    log("🧹", "Running cleanup");

    cancelAnimationFrame(animFrameRef.current);
    processorRef.current?.disconnect();
    gainNodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current  = null;
    silentDestRef.current = null;

    streamRef.current?.getTracks().forEach(t => {
      t.stop();
      log("🛑", `Track stopped: ${t.label}`);
    });

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(e => warn("AudioContext close error:", e.message));
    }
  }, []);

  const handleEndSession = useCallback(() => {
    log("📵", "End Session clicked");
    log("📊", "Stats:", {
      totalChunks:      chunkCountRef.current,
      sentToElevenLabs: sentCountRef.current,
      blockedByAvatar:  blockedAvatarRef.current,
    });

    doCleanup();

    if (cameraOn) onToggleCamera();

    setMicActive(false);
    setStarted(false);
    setIsSpeaking(false);
    setRmsDebug(0);
    chunkCountRef.current    = 0;
    sentCountRef.current     = 0;
    blockedAvatarRef.current = 0;

    onEndSession?.();
  }, [cameraOn, onToggleCamera, onEndSession, doCleanup]);

  useEffect(() => {
    return () => {
      log("🧹", "Unmount cleanup");
      doCleanup();
    };
  }, [doCleanup]);

  const bars        = [0.3, 0.6, 1.0, 0.7, 0.5, 0.85, 0.45, 0.7, 0.35];
  const volumeScale = Math.min(1, volumeRef.current / 45);

  const callStatus =
      micError         ? micError
    : !started         ? "Click 🎤 to begin"
    : !micActive       ? "Connecting…"
    : isAvatarSpeaking ? "AI speaking…"
    : isSpeaking       ? "● Speaking…"
    : "Speak now";

  const statusColor =
      micError         ? "#ff6584"
    : !started         ? "var(--text-muted)"
    : isAvatarSpeaking ? "#f7971e"
    : isSpeaking       ? "#43e97b"
    : micActive        ? "#6c63ff"
    : "var(--text-muted)";

  const rmsPercent  = Math.min(100, (rmsDebug / 0.1) * 100);
  const thresholdPx = Math.min(100, (SPEECH_THRESHOLD / 0.1) * 100);

  return (
    <div style={{
      background: "linear-gradient(180deg, #0a0a14 0%, #080810 100%)",
      borderTop: "1px solid var(--border)",
      padding: "0.75rem 1.5rem",
      display: "flex", flexDirection: "column",
      gap: "0.5rem", flexShrink: 0,
    }}>

      {/* Mic level bar — shows RMS + threshold marker */}
      {micActive && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{
            fontSize: "0.62rem", color: "var(--text-muted)",
            whiteSpace: "nowrap", width: 60
          }}>
            Mic level
          </span>
          <div style={{
            flex: 1, height: 6, borderRadius: 3,
            background: "var(--border)",
            position: "relative", overflow: "hidden"
          }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${rmsPercent}%`,
              background: isSpeaking
                ? "linear-gradient(90deg, #43e97b, #38f9d7)"
                : "linear-gradient(90deg, #6c63ff, #9c55ff)",
              borderRadius: 3,
              transition: "width 0.05s ease"
            }} />
            {/* Red threshold marker */}
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${thresholdPx}%`,
              width: 2, background: "#ff6584", opacity: 0.8
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

      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "1rem"
      }}>

        {/* Left — status dot + waveform + label */}
        <div style={{
          display: "flex", alignItems: "center",
          gap: "0.85rem", minWidth: 180
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background:
                micError   ? "#ff6584"
              : !started   ? "#333"
              : isSpeaking ? "#43e97b"
              : micActive  ? "#6c63ff"
              : "#333",
            boxShadow: isSpeaking
              ? "0 0 0 3px rgba(67,233,123,0.25), 0 0 12px rgba(67,233,123,0.5)"
              : micActive && started
                ? "0 0 0 3px rgba(108,99,255,0.15)"
                : "none",
            animation: isSpeaking
              ? "livePulse 1s ease-in-out infinite"
              : "none",
            transition: "all 0.2s ease"
          }} />

          <div style={{
            display: "flex", alignItems: "center",
            gap: 2.5, height: 26
          }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                background: isSpeaking
                  ? "rgba(67,233,123,0.8)"
                  : micActive
                    ? "rgba(108,99,255,0.45)"
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

        {/* Centre — controls */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem"
        }}>
          {!started ? (
            <button
              onClick={startMic}
              title="Start conversation"
              style={{
                width: 54, height: 54, borderRadius: "50%",
                border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, var(--accent), #9c55ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.5rem",
                boxShadow: "0 4px 24px rgba(108,99,255,0.55)",
                animation: "glowPulse 2s ease-in-out infinite",
              }}
            >
              🎤
            </button>
          ) : (
            // Live mic indicator — shows state, not a button
            <div
              title="Mic is live"
              style={{
                width: 46, height: 46, borderRadius: "50%",
                background: isAvatarSpeaking
                  ? "rgba(247,151,30,0.15)"
                  : isSpeaking
                    ? "rgba(67,233,123,0.15)"
                    : "rgba(108,99,255,0.15)",
                display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "1.2rem",
                outline: isSpeaking
                  ? "2px solid rgba(67,233,123,0.5)"
                  : isAvatarSpeaking
                    ? "2px solid rgba(247,151,30,0.4)"
                    : "2px solid rgba(108,99,255,0.3)",
                transition: "all 0.2s ease",
              }}
            >
              {isAvatarSpeaking ? "🔊" : isSpeaking ? "🎙️" : "🎤"}
            </div>
          )}

          <button
            onClick={onToggleCamera}
            title={cameraOn ? "Camera off" : "Camera on"}
            style={{
              width: 46, height: 46, borderRadius: "50%",
              border: "none", cursor: "pointer",
              background: cameraOn
                ? "rgba(67,233,123,0.15)"
                : "rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "1.2rem",
              transition: "all 0.2s ease",
              outline: cameraOn
                ? "2px solid rgba(67,233,123,0.4)"
                : "none",
            }}
          >
            📷
          </button>
        </div>

        {/* Right — End Session */}
        <button
          onClick={handleEndSession}
          style={{
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