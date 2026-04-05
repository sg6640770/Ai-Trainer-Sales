import { useState, useRef, useCallback, useEffect } from "react";
import PersonaSelector from "./components/PersonaSelector.jsx";
import AvatarPanel     from "./components/AvatarPanel.jsx";
import VoiceRecorder   from "./components/VoiceRecorder.jsx";
import TranscriptPanel from "./components/TranscriptPanel.jsx";
import FeedbackReport  from "./components/FeedbackReport.jsx";

const WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/session`;
})();

function log(emoji, label, ...args) {
  console.log(`[${performance.now().toFixed(0)}ms] ${emoji} [App] ${label}`, ...args);
}

// Play raw PCM16 audio from ElevenLabs (16000Hz mono)
function playPCM16(b64, audioCtxRef) {
  try {
    const raw     = atob(b64);
    const bytes   = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const samples = bytes.length / 2;
    const float32 = new Float32Array(samples);
    const view    = new DataView(bytes.buffer);
    for (let i = 0; i < samples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();

    return float32.length / 16000; // return duration in seconds
  } catch (err) {
    console.error("PCM playback error:", err);
    return 0;
  }
}

export default function App() {
  const [screen,           setScreen]           = useState("setup");
  const [persona,          setPersona]          = useState("parent");
  const [language,         setLanguage]         = useState("hinglish");
  const [transcript,       setTranscript]       = useState([]);
  const [status,           setStatus]           = useState("idle");
  const [feedback,         setFeedback]         = useState(null);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [cameraOn,         setCameraOn]         = useState(false);
  const [cameraStream,     setCameraStream]     = useState(null);

  const wsRef         = useRef(null);
  const audioCtxRef   = useRef(null);
  const simliAudioRef = useRef(null);
  const simliReadyRef = useRef(false);
  const speakTimerRef = useRef(null);
  const endingRef     = useRef(false);

  // ── CRITICAL FIX: Calculate exact audio duration before setting timer ──
  const handleAgentAudio = useCallback((b64) => {
    // Always set speaking true immediately
    setIsAvatarSpeaking(true);
    clearTimeout(speakTimerRef.current);

    try {
      // Decode base64 to get byte count
      const raw   = atob(b64);
      const bytes = raw.length;

      // PCM 16000Hz 16-bit mono = 2 bytes per sample
      // Duration = bytes / 2 / 16000 * 1000 (ms)
      const durationMs = (bytes / 2 / 16000) * 1000;

      // Add 800ms buffer AFTER audio finishes before opening mic
      // This prevents mic from catching the tail end of agent speech
      const blockMs = durationMs + 800;

      log("🔊", `Agent audio chunk`,
        `| duration: ${durationMs.toFixed(0)}ms`,
        `| mic blocked for: ${blockMs.toFixed(0)}ms`
      );

      speakTimerRef.current = setTimeout(() => {
        setIsAvatarSpeaking(false);
        log("🎤", "Mic unblocked — user can speak now");
      }, blockMs);

    } catch {
      // Fallback if b64 decode fails
      speakTimerRef.current = setTimeout(
        () => setIsAvatarSpeaking(false), 3000
      );
    }

    // Play audio — via Simli or direct PCM
    if (simliReadyRef.current && simliAudioRef.current) {
      simliAudioRef.current(b64);
    } else {
      playPCM16(b64, audioCtxRef);
    }
  }, []);

  const connectWS = useCallback(() => {
    if (wsRef.current) return;
    endingRef.current = false;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      log("🔗", "WebSocket connected");
      ws.send(JSON.stringify({ persona, language }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case "session_ready":
          setStatus("ready");
          setScreen("session");
          log("✅", "Session ready");
          break;

        case "status":
          setStatus(msg.message || "");
          break;

        case "transcript":
          setTranscript(prev => [...prev, {
            role: msg.role,
            text: msg.text
          }]);
          break;

        case "agent_audio":
          handleAgentAudio(msg.audio);
          break;

        case "session_feedback":
          setFeedback(msg.feedback);
          setScreen("feedback");
          break;

        case "error":
          setStatus(`Error: ${msg.message}`);
          console.error("Server error:", msg.message);
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      log("🔌", "WebSocket closed");
      if (endingRef.current) {
        setStatus("Session ended");
        setScreen("setup");
        setTranscript([]);
        setIsAvatarSpeaking(false);
        simliReadyRef.current = false;
        simliAudioRef.current = null;
        endingRef.current     = false;
      } else {
        setStatus("disconnected");
      }
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
      setStatus("Connection error — is backend running?");
    };
  }, [persona, language, handleAgentAudio]);

  // Send raw PCM ArrayBuffer to backend → ElevenLabs
  const sendAudio = useCallback((pcmBytes) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // pcmBytes is Uint8Array from VoiceRecorder — send its buffer
    wsRef.current.send(pcmBytes instanceof Uint8Array ? pcmBytes.buffer : pcmBytes);
  }, []);

  const endSession = useCallback(() => {
    endingRef.current = true;
    clearTimeout(speakTimerRef.current);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_session" }));
      setStatus("Generating feedback...");
    } else {
      setScreen("setup");
      setTranscript([]);
      setStatus("idle");
    }
  }, []);

  const resetSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    clearTimeout(speakTimerRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current  = null;
    simliAudioRef.current = null;
    simliReadyRef.current = false;
    setTranscript([]);
    setFeedback(null);
    setStatus("idle");
    setIsAvatarSpeaking(false);
    setScreen("setup");
  }, []);

  const handleSimliAudioReady = useCallback((fn) => {
    simliAudioRef.current = fn;
    simliReadyRef.current = fn !== null;
    log("🎭", `Simli audio ready: ${fn !== null}`);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraStream?.getTracks().forEach(t => t.stop());
      setCameraStream(null);
      setCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true, audio: false
        });
        setCameraStream(stream);
        setCameraOn(true);
      } catch (err) {
        console.error("Camera error:", err);
      }
    }
  }, [cameraOn, cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {screen === "setup" && (
        <PersonaSelector
          persona={persona}   setPersona={setPersona}
          language={language} setLanguage={setLanguage}
          onStart={connectWS}
        />
      )}

      {screen === "session" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          height: "100vh",
          overflow: "hidden"
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0
          }}>
            <AvatarPanel
              isAvatarSpeaking={isAvatarSpeaking}
              persona={persona}
              onSimliAudioReady={handleSimliAudioReady}
              userCameraStream={cameraStream}
              cameraOn={cameraOn}
            />
            <VoiceRecorder
              onAudioReady={sendAudio}
              status={status}
              isAvatarSpeaking={isAvatarSpeaking}
              onEndSession={endSession}
              cameraOn={cameraOn}
              onToggleCamera={toggleCamera}
            />
          </div>
          <TranscriptPanel transcript={transcript} />
        </div>
      )}

      {screen === "feedback" && (
        <FeedbackReport
          feedback={feedback}
          transcript={transcript}
          onReset={resetSession}
        />
      )}
    </div>
  );
}