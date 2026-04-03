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
  const [screen,          setScreen]          = useState("setup");
  const [persona,         setPersona]         = useState("parent");
  const [language,        setLanguage]        = useState("hinglish");
  const [transcript,      setTranscript]      = useState([]);
  const [status,          setStatus]          = useState("idle");
  const [feedback,        setFeedback]        = useState(null);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [cameraOn,        setCameraOn]        = useState(false);
  const [cameraStream,    setCameraStream]    = useState(null);

  const wsRef         = useRef(null);
  const audioCtxRef   = useRef(null);
  const simliAudioRef = useRef(null);
  const simliReadyRef = useRef(false);
  const speakTimerRef = useRef(null);
  const endingRef     = useRef(false);

  const handleAgentAudio = useCallback((b64) => {
    setIsAvatarSpeaking(true);
    clearTimeout(speakTimerRef.current);
    speakTimerRef.current = setTimeout(() => setIsAvatarSpeaking(false), 2000);

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

    ws.onclose = () => {
      wsRef.current = null;
      if (endingRef.current) {
        setStatus("Session ended");
        setScreen("setup");
        setTranscript([]);
        setIsAvatarSpeaking(false);
        simliReadyRef.current = false;
        simliAudioRef.current = null;
        endingRef.current = false;
      } else {
        setStatus("disconnected");
      }
    };

    ws.onerror = () => setStatus("Connection error — is the backend running?");
  }, [persona, language, handleAgentAudio]);

  const sendAudio = useCallback(async (audioBlob) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const buffer = await audioBlob.arrayBuffer();
    wsRef.current.send(buffer);
  }, []);

  const endSession = useCallback(() => {
    endingRef.current = true;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_session" }));
    } else {
      setScreen("setup");
      setTranscript([]);
      setStatus("idle");
      setIsAvatarSpeaking(false);
    }
  }, []);

  const resetSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
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
    simliAudioRef.current  = fn;
    simliReadyRef.current  = fn !== null;
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraStream?.getTracks().forEach(t => t.stop());
      setCameraStream(null);
      setCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100vh" }}>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
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
              autoStart={true}
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
