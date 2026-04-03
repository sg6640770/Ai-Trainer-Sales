import { useState, useRef, useCallback } from "react";
import PersonaSelector  from "./components/PersonaSelector.jsx";
import AvatarPanel      from "./components/AvatarPanel.jsx";
import VoiceRecorder    from "./components/VoiceRecorder.jsx";
import TranscriptPanel  from "./components/TranscriptPanel.jsx";
import FeedbackReport   from "./components/FeedbackReport.jsx";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/session";

// ── Play raw PCM 16-bit 16000Hz audio from base64 string ─────────────────────
function playPCM16(b64, audioCtxRef) {
  try {
    const raw     = atob(b64);
    const bytes   = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    // PCM 16-bit LE → Float32
    const samples = bytes.length / 2;
    const float32 = new Float32Array(samples);
    const view    = new DataView(bytes.buffer);
    for (let i = 0; i < samples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    // Reuse or create AudioContext
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    }
    const ctx    = audioCtxRef.current;
    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  } catch (err) {
    console.error("PCM playback error:", err);
  }
}

export default function App() {
  const [screen,   setScreen]   = useState("setup");
  const [persona,  setPersona]  = useState("parent");
  const [language, setLanguage] = useState("hinglish");
  const [transcript, setTranscript] = useState([]);
  const [status,   setStatus]   = useState("idle");
  const [feedback, setFeedback] = useState(null);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);

  const wsRef          = useRef(null);
  const audioCtxRef    = useRef(null);
  const simliAudioRef  = useRef(null);
  const speakTimerRef  = useRef(null);

  // ── Handle audio from ElevenLabs ──────────────────────────────────────────
  const handleAgentAudio = useCallback((b64) => {
    // 1. Play PCM audio in the browser
    playPCM16(b64, audioCtxRef);

    // 2. Mark avatar as speaking
    setIsAvatarSpeaking(true);
    clearTimeout(speakTimerRef.current);
    speakTimerRef.current = setTimeout(() => setIsAvatarSpeaking(false), 2000);

    // 3. Forward to Simli for lipsync
    simliAudioRef.current?.(b64);
  }, []);

  // ── Connect WebSocket ──────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ persona, language }));

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case "session_ready":
          setStatus("ready");
          setScreen("session");
          break;
        case "status":
          setStatus(msg.message || "");
          break;
        case "transcript":
          setTranscript(prev => [...prev, { role: msg.role, text: msg.text }]);
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

    ws.onclose = () => { wsRef.current = null; setStatus("disconnected"); };
    ws.onerror = () => setStatus("Connection error — is the backend running?");
  }, [persona, language, handleAgentAudio]);

  // ── Send mic audio to backend ──────────────────────────────────────────────
  const sendAudio = useCallback(async (audioBlob) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const buffer = await audioBlob.arrayBuffer();
    wsRef.current.send(buffer);
  }, []);

  const endSession = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "end_session" }));
  }, []);

  const resetSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setTranscript([]);
    setFeedback(null);
    setStatus("idle");
    setIsAvatarSpeaking(false);
    setScreen("setup");
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)" }}>

      {screen === "setup" && (
        <PersonaSelector
          persona={persona}   setPersona={setPersona}
          language={language} setLanguage={setLanguage}
          onStart={connectWS}
        />
      )}

      {screen === "session" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", height:"100vh" }}>
          <div style={{ display:"flex", flexDirection:"column" }}>
            <AvatarPanel
              isAvatarSpeaking={isAvatarSpeaking}
              persona={persona}
              onSimliAudioReady={(fn) => { simliAudioRef.current = fn; }}
            />
            <VoiceRecorder
              onAudioReady={sendAudio}
              status={status}
              isAvatarSpeaking={isAvatarSpeaking}
              onEndSession={endSession}
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