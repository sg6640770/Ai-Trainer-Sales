import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

export default function FeedbackReport({ feedback, transcript, onReset }) {
  if (!feedback) return null;

  const scores = feedback.scores || {};
  const radarData = [
    { skill: "Objection", value: scores.objection_handling || 0 },
    { skill: "Knowledge", value: scores.product_knowledge || 0 },
    { skill: "Empathy",   value: scores.empathy_rapport || 0 },
    { skill: "Clarity",   value: scores.communication_clarity || 0 },
    { skill: "Closing",   value: scores.closing_technique || 0 }
  ];

  const overall = feedback.overall_readiness || 0;
  const color = overall >= 7 ? "#43e97b" : overall >= 4 ? "#f7971e" : "#ff6584";
  const grade = overall >= 8 ? "Excellent" : overall >= 6 ? "Good" : overall >= 4 ? "Fair" : "Needs Work";

  const scoreItems = [
    { label: "Objection Handling", value: scores.objection_handling || 0 },
    { label: "Product Knowledge",  value: scores.product_knowledge || 0 },
    { label: "Empathy & Rapport",  value: scores.empathy_rapport || 0 },
    { label: "Communication",      value: scores.communication_clarity || 0 },
    { label: "Closing Technique",  value: scores.closing_technique || 0 }
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "2rem", overflowY: "auto" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: "2rem"
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "2rem",
              fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "0.3rem"
            }}>
              Session Report
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {transcript.length} messages · {Math.ceil(transcript.length / 2)} exchanges
            </div>
          </div>
          <button onClick={onReset} style={{
            background: "linear-gradient(135deg, var(--accent), #9c55ff)",
            border: "none", borderRadius: "12px",
            padding: "0.65rem 1.25rem", color: "#fff",
            fontWeight: 700, cursor: "pointer",
            fontFamily: "var(--font-body)", fontSize: "0.88rem",
            boxShadow: "0 4px 16px rgba(108,99,255,0.35)"
          }}>
            + New Session
          </button>
        </div>

        {/* Overall score + summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "200px 1fr",
          gap: "1.25rem", marginBottom: "1.25rem"
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid var(--border)", padding: "1.5rem",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "0.4rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600
            }}>
              Readiness
            </div>
            <div style={{
              fontSize: "3.5rem", fontFamily: "var(--font-display)",
              fontWeight: 800, color, lineHeight: 1
            }}>
              {overall}
              <span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>/10</span>
            </div>
            <div style={{
              fontSize: "0.75rem", fontWeight: 700, color,
              background: `${color}18`, borderRadius: "20px", padding: "0.2rem 0.7rem"
            }}>
              {grade}
            </div>
          </div>

          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid var(--border)", padding: "1.5rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 600, marginBottom: "0.75rem"
            }}>
              Summary
            </div>
            <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: "var(--text)" }}>
              {feedback.summary || "No summary available."}
            </p>
          </div>
        </div>

        {/* Radar + score bars */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "1.25rem", marginBottom: "1.25rem"
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid var(--border)", padding: "1.5rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 600, marginBottom: "1rem"
            }}>
              Skill Radar
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e1e30" />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={{ fill: "#6060a0", fontSize: 11, fontWeight: 600 }}
                />
                <Radar
                  dataKey="value"
                  stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.2} strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid var(--border)", padding: "1.5rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 600, marginBottom: "1rem"
            }}>
              Score Breakdown
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {scoreItems.map((item, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: "0.78rem", fontWeight: 700,
                      color: item.value >= 7 ? "#43e97b" : item.value >= 4 ? "#f7971e" : "#ff6584"
                    }}>
                      {item.value}/10
                    </span>
                  </div>
                  <div style={{
                    height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: `${item.value * 10}%`,
                      background: item.value >= 7
                        ? "linear-gradient(90deg, #43e97b, #38f9d7)"
                        : item.value >= 4
                          ? "linear-gradient(90deg, #f7971e, #ffd200)"
                          : "linear-gradient(90deg, #ff6584, #ff3b6b)",
                      transition: "width 1s ease"
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Strengths + Improvements */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "1.25rem", marginBottom: "1.25rem"
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid rgba(67,233,123,0.15)", padding: "1.25rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "#43e97b",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 700, marginBottom: "0.9rem",
              display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              <span>✓</span> Strengths
            </div>
            {(feedback.strengths || []).map((s, i) => (
              <div key={i} style={{
                fontSize: "0.83rem", color: "var(--text)",
                marginBottom: "0.5rem", paddingLeft: "0.85rem",
                borderLeft: "2px solid rgba(67,233,123,0.4)", lineHeight: 1.5
              }}>
                {s}
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid rgba(247,151,30,0.15)", padding: "1.25rem"
          }}>
            <div style={{
              fontSize: "0.68rem", color: "#f7971e",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 700, marginBottom: "0.9rem",
              display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              <span>↑</span> Improvements
            </div>
            {(feedback.improvements || []).map((s, i) => (
              <div key={i} style={{
                fontSize: "0.83rem", color: "var(--text)",
                marginBottom: "0.5rem", paddingLeft: "0.85rem",
                borderLeft: "2px solid rgba(247,151,30,0.4)", lineHeight: 1.5
              }}>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Full Transcript */}
        <div style={{
          background: "var(--surface)", borderRadius: "var(--radius)",
          border: "1px solid var(--border)", padding: "1.5rem"
        }}>
          <div style={{
            fontSize: "0.68rem", color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.1em",
            fontWeight: 600, marginBottom: "1rem"
          }}>
            Full Transcript
          </div>
          <div style={{
            display: "flex", flexDirection: "column",
            gap: "0.65rem", maxHeight: 280, overflowY: "auto"
          }}>
            {transcript.map((msg, i) => (
              <div key={i} style={{ fontSize: "0.84rem", lineHeight: 1.6 }}>
                <span style={{
                  color: msg.role === "user" ? "var(--accent)" : "var(--accent2)",
                  fontWeight: 700, marginRight: "0.5rem"
                }}>
                  {msg.role === "user" ? "Counsellor:" : "AI Persona:"}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{msg.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}