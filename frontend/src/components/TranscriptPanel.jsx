import { useEffect, useRef } from "react";

export default function TranscriptPanel({ transcript }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <div style={{
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        padding: "1rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "0.6rem",
        background: "var(--surface2)"
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: transcript.length > 0 ? "var(--success)" : "var(--border)",
          boxShadow: transcript.length > 0 ? "0 0 8px rgba(67,233,123,0.6)" : "none",
          transition: "all 0.3s ease"
        }} />
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: "0.78rem", letterSpacing: "0.1em",
          color: "var(--text-muted)", textTransform: "uppercase"
        }}>
          Live Transcript
        </span>
        {transcript.length > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: "0.68rem",
            color: "var(--text-muted)", background: "var(--border)",
            borderRadius: "20px", padding: "0.15rem 0.55rem", fontWeight: 600
          }}>
            {transcript.length}
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "1.25rem 1rem",
        display: "flex", flexDirection: "column", gap: "1rem"
      }}>
        {transcript.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            flex: 1, gap: "0.75rem", opacity: 0.5, marginTop: "3rem"
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--surface2)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.4rem"
            }}>
              💬
            </div>
            <div style={{
              fontSize: "0.82rem", color: "var(--text-muted)",
              textAlign: "center", lineHeight: 1.6
            }}>
              Conversation will<br />appear here…
            </div>
          </div>
        )}

        {transcript.map((msg, i) => {
          const isUser = msg.role === "user";
          const speakerLabel = isUser ? "You" : "AI Persona";
          return (
            <div key={i} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isUser ? "flex-end" : "flex-start",
              animation: "fadeSlideIn 0.25s ease"
            }}>
              <div style={{
                fontSize: "0.62rem",
                color: isUser ? "var(--accent)" : "var(--accent2)",
                marginBottom: "0.3rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                paddingLeft: isUser ? 0 : "0.25rem",
                paddingRight: isUser ? "0.25rem" : 0
              }}>
                {speakerLabel}
              </div>
              <div style={{
                background: isUser
                  ? "linear-gradient(135deg, rgba(108,99,255,0.25), rgba(108,99,255,0.12))"
                  : "var(--surface2)",
                border: `1px solid ${isUser ? "rgba(108,99,255,0.35)" : "var(--border)"}`,
                borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                padding: "0.65rem 0.95rem",
                maxWidth: "90%", fontSize: "0.86rem", lineHeight: 1.6,
                color: "var(--text)",
                boxShadow: isUser
                  ? "0 2px 12px rgba(108,99,255,0.12)"
                  : "0 2px 8px rgba(0,0,0,0.2)"
              }}>
                {msg.text}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}