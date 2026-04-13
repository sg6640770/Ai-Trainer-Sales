import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import FeedbackReport from "./FeedbackReport.jsx";

const scoreColor = (v) => v >= 7 ? "#43e97b" : v >= 4 ? "#f7971e" : "#ff6584";

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "1.25rem 1.5rem"
    }}>
      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{sub}</div>}
    </div>
  );
}

export default function TraineeDashboard({ onStartSimulation }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const traineeRes = await api.getTrainees(user.institute_id);
        const myTrainee = (traineeRes.trainees || []).find(t => t.user_id === user.id);
        if (myTrainee) {
          const dash = await api.traineeDashboard(myTrainee.id, page);
          setData(dash);
        } else {
          setData({ simulations: [], feedback: [], progress: null, total_pages: 1 });
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, page]);

  const progress = data?.progress;
  const simulations = data?.simulations || [];

  async function openReport(simulation) {
    try {
      const [feedbackRes, messagesRes] = await Promise.all([
        api.getFeedback(simulation.id),
        api.getMessages(simulation.id)
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
      setSelectedReport({
        feedback: normalizedFeedback,
        transcript
      });
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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 800 }}>
              My Dashboard
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
              Welcome back, {user.name}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={onStartSimulation} style={{
              background: "linear-gradient(135deg, var(--accent), #9c55ff)",
              border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem",
              color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem"
            }}>
              + New Simulation
            </button>
            <button onClick={logout} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "12px", padding: "0.65rem 1.25rem",
              color: "var(--text-muted)", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem"
            }}>
              Logout
            </button>
          </div>
        </div>

        {loading && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>Loading your data…</div>}
        {error && <div style={{ color: "#ff6584", padding: "1rem" }}>{error}</div>}

        {!loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
              <StatCard label="Total Sessions" value={data?.total_sessions ?? simulations.length} />
              <StatCard
                label="Average Score"
                value={progress?.average_score != null ? `${progress.average_score}/10` : "—"}
                sub={progress?.average_score != null
                  ? (progress.average_score >= 7 ? "Excellent" : progress.average_score >= 4 ? "Good" : "Needs Work")
                  : "No sessions yet"}
              />
              <StatCard label="Persona Variety" value={[...new Set(simulations.map(s => s.persona))].length} sub="different personas" />
            </div>

            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "1.5rem"
            }}>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "1rem" }}>
                Recent Sessions
              </div>
              {simulations.length === 0
                ? <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", padding: "2rem 0" }}>No sessions yet. Start your first simulation!</div>
                : simulations.map((sim, i) => {
                  const fb = data.feedback.find(f => f.simulation_id === sim.id);
                  return (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.85rem 0", borderBottom: i < simulations.length - 1 ? "1px solid var(--border)" : "none"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                          {sim.persona === "parent" ? "Skeptical Parent" : sim.persona === "student" ? "Confused Student" : "Parent + Student"}
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                          {new Date(sim.started_at).toLocaleDateString()} · {sim.language}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {fb ? (
                          <button onClick={() => openReport(sim)} style={{
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            padding: "0.45rem 0.85rem",
                            color: "var(--text)",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontWeight: 600
                          }}>
                            View report
                          </button>
                        ) : (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No feedback</div>
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
              {(data?.total_pages || 1) > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                  <button
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    disabled={page <= 1}
                    style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                      cursor: page <= 1 ? "not-allowed" : "pointer"
                    }}
                  >
                    Previous
                  </button>
                  <div style={{ color: "var(--text-muted)", alignSelf: "center" }}>
                    Page {page} of {data?.total_pages || 1}
                  </div>
                  <button
                    onClick={() => setPage((prev) => Math.min(prev + 1, data?.total_pages || 1))}
                    disabled={page >= (data?.total_pages || 1)}
                    style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: "12px", padding: "0.65rem 1rem", color: "var(--text)",
                      cursor: page >= (data?.total_pages || 1) ? "not-allowed" : "pointer"
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}