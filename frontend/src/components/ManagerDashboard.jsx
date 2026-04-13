import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import FeedbackReport from "./FeedbackReport.jsx";

const scoreColor = (v) => v >= 7 ? "#43e97b" : v >= 4 ? "#f7971e" : "#ff6584";

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [traineePage, setTraineePage] = useState(1);
  const [sessionPage, setSessionPage] = useState(1);

  useEffect(() => {
    async function load() {
      if (!user.institute_id) { setLoading(false); return; }
      setLoading(true);
      try {
        const dash = await api.managerDashboard(user.institute_id, traineePage, sessionPage);
        setData(dash);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, traineePage, sessionPage]);

  const trainees = data?.trainees || [];
  const sessions = data?.sessions || [];
  const avgScore = (() => {
    const totals = trainees.reduce((acc, t) => {
      const score = t.progress?.average_score || 0;
      const count = t.progress?.total_sessions || 0;
      return {
        sum: acc.sum + score * count,
        count: acc.count + count
      };
    }, { sum: 0, count: 0 });
    return totals.count ? (totals.sum / totals.count).toFixed(1) : "—";
  })();

  async function openReport(session) {
    try {
      const [messagesRes, feedbackRes] = await Promise.all([
        api.getMessages(session.id),
        session.feedback
          ? Promise.resolve({ feedback: session.feedback })
          : api.getFeedback(session.id)
      ]);
      const transcript = (messagesRes.messages || []).map((msg) => {
        const sender = (msg.sender || msg.role || "").toString().toLowerCase();
        const role = sender === "user" ? "user" : "assistant";
        return {
          role,
          text: msg.message || msg.text || ""
        };
      });
      const fb = feedbackRes.feedback;
      const normalizedFeedback = {
        overall_readiness: fb?.overall_score || 0,
        summary: fb?.summary || "No summary available.",
        scores: {
          objection_handling: fb?.objection_handling_score || 0,
          product_knowledge: fb?.product_knowledge_score || 0,
          empathy_rapport: fb?.soft_skills_score || 0,
          communication_clarity: fb?.communication_clarity_score || 0,
          closing_technique: fb?.closing_technique_score || 0
        },
        strengths: fb?.strengths || [],
        improvements: fb?.improvements || []
      };
      setSelectedReport({ feedback: normalizedFeedback, transcript });
    } catch (e) {
      setError(e.message);
    }
  }

  if (selectedReport) {
    return (
      <FeedbackReport
        feedback={selectedReport.feedback}
        transcript={selectedReport.transcript}
        onReset={() => setSelectedReport(null)}
        backLabel="← Back to dashboard"
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "2rem" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 800 }}>
              Manager Dashboard
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
              {data?.institute?.institute_name || "Your Institute"} · {user.name}
            </div>
          </div>
          <button onClick={logout} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "12px", padding: "0.65rem 1.25rem",
            color: "var(--text-muted)", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem"
          }}>
            Logout
          </button>
        </div>

        {loading && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>
            Loading dashboard…
          </div>
        )}
        {error && <div style={{ color: "#ff6584", padding: "1rem" }}>{error}</div>}

        {!loading && !error && (
          <>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
              {[
                { label: "Total Trainees", value: data?.total_trainees ?? 0 },
                { label: "Avg. Score", value: avgScore !== "—" ? `${avgScore}/10` : "—" },
                { label: "Active Sessions", value: trainees.filter(t => (t.progress?.total_sessions || 0) > 0).length },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: "1.25rem 1.5rem"
                }}>
                  <div style={{
                    fontSize: "0.68rem", color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    fontWeight: 600, marginBottom: "0.5rem"
                  }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Trainee Performance Table */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "1.5rem"
            }}>
              <div style={{
                fontSize: "0.68rem", color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                fontWeight: 600, marginBottom: "1rem"
              }}>
                Trainee Performance
              </div>

              {trainees.length === 0 ? (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>
                  No trainees enrolled yet.
                </div>
              ) : (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Name", "Email", "Sessions", "Avg Score", "Status"].map(h => (
                          <th key={h} style={{
                            textAlign: "left", fontSize: "0.68rem", color: "var(--text-muted)",
                            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
                            paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)"
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trainees.map((t, i) => {
                        const u = t.trainee?.users;
                        const p = t.progress;
                        const score = p?.average_score || 0;
                        return (
                          <tr key={i}>
                            <td style={{
                              padding: "0.85rem 0", borderBottom: "1px solid var(--border)",
                              fontSize: "0.88rem", fontWeight: 600
                            }}>
                              {u?.name || "—"}
                            </td>
                            <td style={{
                              padding: "0.85rem 0", borderBottom: "1px solid var(--border)",
                              fontSize: "0.82rem", color: "var(--text-muted)"
                            }}>
                              {u?.email || "—"}
                            </td>
                            <td style={{
                              padding: "0.85rem 0", borderBottom: "1px solid var(--border)",
                              fontSize: "0.88rem"
                            }}>
                              {p?.total_sessions ?? 0}
                            </td>
                            <td style={{ padding: "0.85rem 0", borderBottom: "1px solid var(--border)" }}>
                              {p?.total_sessions ? (
                                <span style={{
                                  fontSize: "0.85rem", fontWeight: 700,
                                  color: scoreColor(score),
                                  background: `${scoreColor(score)}18`,
                                  borderRadius: "20px", padding: "0.2rem 0.65rem"
                                }}>
                                  {score}/10
                                </span>
                              ) : (
                                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                  No data
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0.85rem 0", borderBottom: "1px solid var(--border)" }}>
                              <span style={{
                                fontSize: "0.72rem", fontWeight: 700,
                                color: (p?.total_sessions || 0) > 0 ? "#43e97b" : "var(--text-muted)",
                                background: (p?.total_sessions || 0) > 0
                                  ? "rgba(67,233,123,0.12)"
                                  : "var(--surface2)",
                                borderRadius: "20px", padding: "0.2rem 0.65rem"
                              }}>
                                {(p?.total_sessions || 0) > 0 ? "Active" : "Not started"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(data?.trainee_total_pages || 1) > 1 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                      <button
                        onClick={() => setTraineePage(prev => Math.max(prev - 1, 1))}
                        disabled={traineePage <= 1}
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                          cursor: traineePage <= 1 ? "not-allowed" : "pointer"
                        }}
                      >
                        Previous
                      </button>
                      <div style={{ color: "var(--text-muted)", alignSelf: "center" }}>
                        Page {traineePage} of {data?.trainee_total_pages || 1}
                      </div>
                      <button
                        onClick={() => setTraineePage(prev => Math.min(prev + 1, data?.trainee_total_pages || 1))}
                        disabled={traineePage >= (data?.trainee_total_pages || 1)}
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                          cursor: traineePage >= (data?.trainee_total_pages || 1) ? "not-allowed" : "pointer"
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Recent Sessions */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "1.5rem", marginTop: "1.5rem"
            }}>
              <div style={{
                fontSize: "0.68rem", color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                fontWeight: 600, marginBottom: "1rem"
              }}>
                Recent Sessions
              </div>

              {sessions.length === 0 ? (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>
                  No sessions available yet.
                </div>
              ) : (
                <>
                  {sessions.map((sim, i) => {
                    const trainee = sim.trainee?.users || sim.trainee;
                    const fb = sim.feedback;
                    return (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "0.85rem 0",
                        borderBottom: i < sessions.length - 1 ? "1px solid var(--border)" : "none"
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                            {trainee?.name || "Unknown Trainee"}
                          </div>
                          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                            {new Date(sim.started_at).toLocaleDateString()} · {sim.persona} · {sim.language}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          {fb ? (
                            <button onClick={() => openReport(sim)} style={{
                              background: "transparent", border: "1px solid var(--border)",
                              borderRadius: "12px", padding: "0.45rem 0.85rem",
                              color: "var(--text)", cursor: "pointer",
                              fontSize: "0.8rem", fontWeight: 600
                            }}>
                              View report
                            </button>
                          ) : (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              No feedback
                            </div>
                          )}
                          {fb && (
                            <div style={{
                              fontSize: "0.85rem", fontWeight: 700,
                              color: scoreColor(fb.overall_score),
                              background: `${scoreColor(fb.overall_score)}18`,
                              borderRadius: "20px", padding: "0.2rem 0.75rem"
                            }}>
                              {fb.overall_score}/10
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {(data?.session_total_pages || 1) > 1 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                      <button
                        onClick={() => setSessionPage(prev => Math.max(prev - 1, 1))}
                        disabled={sessionPage <= 1}
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                          cursor: sessionPage <= 1 ? "not-allowed" : "pointer"
                        }}
                      >
                        Previous
                      </button>
                      <div style={{ color: "var(--text-muted)", alignSelf: "center" }}>
                        Page {sessionPage} of {data?.session_total_pages || 1}
                      </div>
                      <button
                        onClick={() => setSessionPage(prev => Math.min(prev + 1, data?.session_total_pages || 1))}
                        disabled={sessionPage >= (data?.session_total_pages || 1)}
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                          cursor: sessionPage >= (data?.session_total_pages || 1) ? "not-allowed" : "pointer"
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!user.institute_id && !loading && (
          <div style={{
            background: "var(--surface)", border: "1px solid rgba(247,151,30,0.3)",
            borderRadius: "var(--radius)", padding: "1.5rem", textAlign: "center"
          }}>
            <div style={{ color: "#f7971e", fontWeight: 600, marginBottom: "0.5rem" }}>
              No Institute Linked
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Your account is not linked to an institute. Please contact your administrator.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}