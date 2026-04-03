import { useEffect, useRef, useState } from "react";
import { SimliClient, generateSimliSessionToken, generateIceServers } from "simli-client";

const personaColors = { parent: "#f7971e", student: "#43e97b", mixed: "#6c63ff" };
const personaEmoji  = { parent: "👨‍👩‍👧",  student: "🎓",      mixed: "👨‍👩‍👧‍👦" };
const personaLabels = { parent: "Skeptical Parent", student: "Confused Student", mixed: "Parent + Student" };

export default function AvatarPanel({ isAvatarSpeaking, persona, onSimliAudioReady, userCameraStream, cameraOn }) {
  const videoRef  = useRef(null);
  const audioRef  = useRef(null);
  const userVideoRef = useRef(null);
  const simliRef  = useRef(null);
  const [phase, setPhase] = useState("init");

  const color = personaColors[persona] || "#6c63ff";

  useEffect(() => {
    let client = null;
    let active = true;

    async function init() {
      try {
        setPhase("loading");

        const res = await fetch("/api/simli-config");
        const { apiKey, faceId } = await res.json();
        if (!apiKey || !faceId) throw new Error("Simli credentials not configured");

        const [{ session_token }, iceServers] = await Promise.all([
          generateSimliSessionToken({
            config: { faceId, handleSilence: true, maxSessionLength: 600, maxIdleTime: 300 },
            apiKey,
          }),
          generateIceServers(apiKey),
        ]);

        if (!active) return;

        client = new SimliClient(
          session_token,
          videoRef.current,
          audioRef.current,
          iceServers
        );

        await client.start();
        if (!active) { client.stop(); return; }

        simliRef.current = client;
        setPhase("ready");

        onSimliAudioReady?.((b64) => {
          if (!simliRef.current) return;
          try {
            const raw   = atob(b64);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            simliRef.current.sendAudioData(bytes);
          } catch (e) {
            console.warn("Simli audio send error:", e);
          }
        });

      } catch (err) {
        console.error("Simli init error:", err);
        if (active) setPhase("error");
        onSimliAudioReady?.(null);
      }
    }

    init();
    return () => {
      active = false;
      simliRef.current = null;
      try { client?.stop(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (userVideoRef.current) {
      userVideoRef.current.srcObject = cameraOn ? userCameraStream : null;
    }
  }, [userCameraStream, cameraOn]);

  const bars = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div style={{
      flex: 1, position: "relative",
      background: "linear-gradient(160deg,#0d0d1a 0%,#080810 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", minHeight: 0
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          opacity: phase === "ready" ? 1 : 0,
          transition: "opacity 0.6s ease",
        }}
      />
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />

      {phase !== "ready" && (
        <div style={{ textAlign: "center", zIndex: 1, position: "relative" }}>
          {phase === "error" ? (
            <>
              <div style={{
                width: 160, height: 160, borderRadius: "50%",
                background: "linear-gradient(135deg,#1a1a2e,#16213e)",
                margin: "0 auto 1.5rem",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "4rem",
                border: `3px solid ${isAvatarSpeaking ? color : `${color}30`}`,
                boxShadow: isAvatarSpeaking
                  ? `0 0 0 8px ${color}18, 0 0 60px ${color}44, inset 0 0 30px ${color}15`
                  : `0 0 20px rgba(0,0,0,0.5)`,
                transition: "all 0.4s ease",
                animation: isAvatarSpeaking ? "avatarPulse 1.8s ease-in-out infinite" : "none"
              }}>
                {personaEmoji[persona] || "🤖"}
              </div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 3, height: 36, marginBottom: "1rem"
              }}>
                {bars.map((h, i) => (
                  <div key={i} style={{
                    width: 3, borderRadius: 3,
                    background: isAvatarSpeaking ? color : `${color}30`,
                    height: isAvatarSpeaking ? `${h * 4}px` : "4px",
                    transition: "height 0.15s ease, background 0.3s ease",
                    animation: isAvatarSpeaking
                      ? `soundBar 0.9s ease-in-out ${i * 0.07}s infinite alternate`
                      : "none",
                  }} />
                ))}
              </div>
              <div style={{
                fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.03em",
                color: isAvatarSpeaking ? color : "var(--text-muted)",
                transition: "color 0.3s ease",
              }}>
                {isAvatarSpeaking ? "Speaking…" : "Listening"}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                border: `2px solid ${color}`,
                borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
                margin: "0 auto 1rem",
              }} />
              Connecting avatar…
            </div>
          )}
        </div>
      )}

      <div style={{
        position: "absolute", top: 14, left: 14, zIndex: 10,
        background: "rgba(8,8,16,0.85)", backdropFilter: "blur(12px)",
        borderRadius: "10px", padding: "0.35rem 0.85rem",
        fontSize: "0.7rem", color, fontWeight: 700,
        border: `1px solid ${color}30`, letterSpacing: "0.05em",
        display: "flex", alignItems: "center", gap: "0.4rem",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
        {personaLabels[persona] || persona}
      </div>

      {isAvatarSpeaking && (
        <div style={{
          position: "absolute", top: 14, right: 14, zIndex: 10,
          background: `rgba(${color === "#f7971e" ? "247,151,30" : color === "#43e97b" ? "67,233,123" : "108,99,255"},0.2)`,
          backdropFilter: "blur(8px)",
          borderRadius: "20px", padding: "0.3rem 0.85rem",
          fontSize: "0.7rem", color, fontWeight: 700,
          display: "flex", alignItems: "center", gap: "0.4rem",
          border: `1px solid ${color}50`,
          boxShadow: `0 4px 16px ${color}30`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: color,
            display: "inline-block", animation: "blink 0.8s ease-in-out infinite",
          }} />
          Speaking
        </div>
      )}

      {cameraOn && userCameraStream && (
        <div style={{
          position: "absolute", bottom: 14, right: 14, zIndex: 10,
          width: 140, height: 105, borderRadius: 12,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.15)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
          background: "#000",
        }}>
          <video
            ref={userVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
        </div>
      )}

      <style>{`
        @keyframes avatarPulse {
          0%,100%{box-shadow:0 0 0 8px ${color}18,0 0 60px ${color}44,inset 0 0 30px ${color}15;}
          50%    {box-shadow:0 0 0 16px ${color}08,0 0 90px ${color}66,inset 0 0 40px ${color}20;}
        }
        @keyframes blink   {0%,100%{opacity:1;}50%{opacity:0.2;}}
        @keyframes soundBar{from{transform:scaleY(0.3);opacity:0.5;}to{transform:scaleY(2);opacity:1;}}
        @keyframes spin    {from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes pulse   {0%,100%{opacity:1;}50%{opacity:0.4;}}
      `}</style>
    </div>
  );
}
