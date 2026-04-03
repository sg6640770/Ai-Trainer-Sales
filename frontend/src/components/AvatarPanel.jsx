import { useEffect, useRef, useState, useCallback } from "react";

const personaLabels = { parent:"Parent Persona", student:"Student Persona", mixed:"Mixed Persona" };
const personaColors  = { parent:"#f7971e",       student:"#43e97b",        mixed:"#6c63ff"       };
const personaEmoji   = { parent:"👨‍👩‍👧",          student:"🎓",              mixed:"👨‍👩‍👧‍👦"          };

/**
 * AvatarPanel
 *
 * Simli Studio (app.simli.com) is a full WebRTC product — it cannot be
 * embedded as a plain iframe without their SDK. Since we are already using
 * ElevenLabs ConvAI for the voice agent, the avatar here is a high-quality
 * animated fallback that reacts to speaking state.
 *
 * If you want true Simli lipsync, integrate @simli-ai/simli-client as a
 * separate npm package and point it at the Simli REST API — but that is a
 * WebRTC peer connection, not an iframe.
 */
export default function AvatarPanel({ isAvatarSpeaking, persona, onSimliAudioReady }) {
  const color = personaColors[persona] || "#6c63ff";

  // Register a no-op so App.jsx doesn't throw
  useEffect(() => {
    onSimliAudioReady?.(() => {});
  }, [onSimliAudioReady]);

  const bars = [1,2,3,4,5,6,7,6,5,4,3,2,1];

  return (
    <div style={{
      flex: 1,
      background: "linear-gradient(160deg,#0d0d1a 0%,#080810 100%)",
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", minHeight: 0
    }}>

      {/* Ambient glow */}
      <div style={{
        position:"absolute", top:"40%", left:"50%",
        transform:"translate(-50%,-50%)",
        width:360, height:360, borderRadius:"50%",
        background: isAvatarSpeaking
          ? `radial-gradient(circle,${color}22 0%,transparent 70%)`
          : `radial-gradient(circle,${color}08 0%,transparent 70%)`,
        transition:"all 0.6s ease", pointerEvents:"none"
      }} />

      {/* Avatar */}
      <div style={{ textAlign:"center", zIndex:1, position:"relative" }}>

        {/* Circle */}
        <div style={{
          width:160, height:160, borderRadius:"50%",
          background:"linear-gradient(135deg,#1a1a2e,#16213e)",
          margin:"0 auto 1.5rem",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:"4rem",
          border:`3px solid ${isAvatarSpeaking ? color : `${color}30`}`,
          boxShadow: isAvatarSpeaking
            ? `0 0 0 8px ${color}18, 0 0 60px ${color}44, inset 0 0 30px ${color}15`
            : `0 0 20px rgba(0,0,0,0.5)`,
          transition:"all 0.4s ease",
          animation: isAvatarSpeaking ? "avatarPulse 1.8s ease-in-out infinite" : "none"
        }}>
          {personaEmoji[persona] || "🤖"}
        </div>

        {/* Sound wave */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          gap:3, height:36, marginBottom:"1rem"
        }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              width:3, borderRadius:3,
              background: isAvatarSpeaking ? color : `${color}30`,
              height: isAvatarSpeaking ? `${h * 4}px` : "4px",
              transition:"height 0.15s ease, background 0.3s ease",
              animation: isAvatarSpeaking
                ? `soundBar 0.9s ease-in-out ${i * 0.07}s infinite alternate`
                : "none"
            }} />
          ))}
        </div>

        {/* Label */}
        <div style={{
          fontSize:"0.85rem", fontWeight:600,
          color: isAvatarSpeaking ? color : "var(--text-muted)",
          transition:"color 0.3s ease",
          letterSpacing:"0.03em"
        }}>
          {isAvatarSpeaking ? "Speaking…" : "Listening"}
        </div>
      </div>

      {/* Persona badge */}
      <div style={{
        position:"absolute", top:14, left:14, zIndex:10,
        background:"rgba(8,8,16,0.85)", backdropFilter:"blur(12px)",
        borderRadius:"10px", padding:"0.35rem 0.85rem",
        fontSize:"0.7rem", color, fontWeight:700,
        letterSpacing:"0.08em", textTransform:"uppercase",
        border:`1px solid ${color}30`,
        display:"flex", alignItems:"center", gap:"0.4rem"
      }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:color }} />
        {personaLabels[persona] || persona}
      </div>

      {/* Speaking badge */}
      {isAvatarSpeaking && (
        <div style={{
          position:"absolute", top:14, right:14, zIndex:10,
          background:"rgba(108,99,255,0.9)", backdropFilter:"blur(8px)",
          borderRadius:"20px", padding:"0.3rem 0.85rem",
          fontSize:"0.7rem", color:"#fff", fontWeight:700,
          display:"flex", alignItems:"center", gap:"0.4rem",
          border:"1px solid rgba(108,99,255,0.5)",
          boxShadow:"0 4px 16px rgba(108,99,255,0.3)"
        }}>
          <span style={{
            width:6, height:6, borderRadius:"50%", background:"#fff",
            display:"inline-block", animation:"blink 0.8s ease-in-out infinite"
          }} />
          Speaking
        </div>
      )}

      <style>{`
        @keyframes avatarPulse {
          0%,100%{box-shadow:0 0 0 8px ${color}18,0 0 60px ${color}44,inset 0 0 30px ${color}15;}
          50%    {box-shadow:0 0 0 16px ${color}08,0 0 90px ${color}66,inset 0 0 40px ${color}20;}
        }
        @keyframes blink   {0%,100%{opacity:1;}50%{opacity:0.2;}}
        @keyframes soundBar{from{transform:scaleY(0.3);opacity:0.5;}to{transform:scaleY(2);opacity:1;}}
      `}</style>
    </div>
  );
}