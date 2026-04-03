export default function PersonaSelector({ persona, setPersona, language, setLanguage, onStart }) {
  const personas = [
    { id: "parent",  label: "Skeptical Parent",   icon: "👨‍👩‍👧",   desc: "Price-sensitive, outcome-focused parent",               color: "#f7971e" },
    { id: "student", label: "Confused Student",   icon: "🎓",      desc: "Aspirational but unsure Class 11/12 student",          color: "#43e97b" },
    { id: "mixed",   label: "Parent + Student",   icon: "👨‍👩‍👧‍👦",  desc: "Realistic family decision dynamic",                    color: "#6c63ff" }
  ];

  const languages = [
    { id: "hinglish", label: "Hinglish", flag: "🇮🇳" },
    { id: "hindi",    label: "Hindi",    flag: "🕉️"  },
    { id: "english",  label: "English",  flag: "🇬🇧" }
  ];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at 30% 40%, #120a2e 0%, var(--bg) 65%)",
      padding: "2rem"
    }}>
      <div style={{ maxWidth: 580, width: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(108,99,255,0.12)",
            border: "1px solid rgba(108,99,255,0.25)",
            borderRadius: "20px",
            padding: "0.3rem 0.85rem",
            fontSize: "0.72rem", fontWeight: 700,
            color: "var(--accent)", letterSpacing: "0.1em",
            textTransform: "uppercase", marginBottom: "1rem"
          }}>
            AI Sales Trainer
          </div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: "2.6rem",
            fontWeight: 800, letterSpacing: "-0.04em",
            lineHeight: 1.1, marginBottom: "0.75rem",
            background: "linear-gradient(135deg, #ffffff 30%, rgba(108,99,255,0.9))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>
            Sales Simulator
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, maxWidth: 420 }}>
            Practice handling real objections with AI-powered role-play before your actual calls.
          </p>
        </div>

        {/* Persona picker */}
        <div style={{ marginBottom: "1.75rem" }}>
          <label style={{
            fontSize: "0.7rem", letterSpacing: "0.12em",
            color: "var(--text-muted)", textTransform: "uppercase",
            fontWeight: 700, display: "block", marginBottom: "0.75rem"
          }}>
            Choose Persona
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {personas.map(p => (
              <button key={p.id} onClick={() => setPersona(p.id)} style={{
                background: persona === p.id
                  ? `rgba(${p.id === "parent" ? "247,151,30" : p.id === "student" ? "67,233,123" : "108,99,255"},0.1)`
                  : "var(--surface)",
                border: `1.5px solid ${persona === p.id ? p.color : "var(--border)"}`,
                borderRadius: "14px", padding: "0.9rem 1.1rem",
                cursor: "pointer", color: "var(--text)", textAlign: "left",
                display: "flex", alignItems: "center", gap: "0.9rem",
                transition: "all 0.2s ease",
                boxShadow: persona === p.id ? `0 4px 20px ${p.color}18` : "none"
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "12px",
                  background: persona === p.id ? `${p.color}18` : "var(--surface2)",
                  border: `1px solid ${persona === p.id ? `${p.color}40` : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.5rem", flexShrink: 0, transition: "all 0.2s ease"
                }}>
                  {p.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 600, fontSize: "0.92rem", marginBottom: "0.15rem",
                    color: persona === p.id ? p.color : "var(--text)"
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {p.desc}
                  </div>
                </div>
                {persona === p.id && (
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: p.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.65rem", color: "#000", fontWeight: 800, flexShrink: 0
                  }}>
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Language picker */}
        <div style={{ marginBottom: "2rem" }}>
          <label style={{
            fontSize: "0.7rem", letterSpacing: "0.12em",
            color: "var(--text-muted)", textTransform: "uppercase",
            fontWeight: 700, display: "block", marginBottom: "0.75rem"
          }}>
            Language
          </label>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            {languages.map(l => (
              <button key={l.id} onClick={() => setLanguage(l.id)} style={{
                flex: 1, padding: "0.7rem 0.5rem",
                background: language === l.id
                  ? "linear-gradient(135deg, var(--accent), #9c55ff)"
                  : "var(--surface)",
                border: `1.5px solid ${language === l.id ? "transparent" : "var(--border)"}`,
                borderRadius: "12px", cursor: "pointer",
                color: language === l.id ? "#fff" : "var(--text-muted)",
                fontWeight: 600, fontSize: "0.85rem",
                transition: "all 0.2s ease",
                boxShadow: language === l.id ? "0 4px 16px rgba(108,99,255,0.3)" : "none",
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: "0.25rem"
              }}>
                <span style={{ fontSize: "1.1rem" }}>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button onClick={onStart} style={{
          width: "100%", padding: "1rem",
          background: "linear-gradient(135deg, var(--accent), #9c55ff)",
          border: "none", borderRadius: "14px",
          color: "#fff", fontFamily: "var(--font-display)",
          fontSize: "1.05rem", fontWeight: 700, cursor: "pointer",
          letterSpacing: "0.02em",
          boxShadow: "0 8px 32px rgba(108,99,255,0.4)",
          transition: "all 0.2s ease"
        }}
          onMouseOver={e => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 40px rgba(108,99,255,0.5)";
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 32px rgba(108,99,255,0.4)";
          }}
        >
          Start Simulation →
        </button>
      </div>
    </div>
  );
}