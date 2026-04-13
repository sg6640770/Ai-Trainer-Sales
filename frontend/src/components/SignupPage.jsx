import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function SignupPage({ onSwitchToLogin }) {
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    role: "trainee", institute_id: "", institute_name: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.institute_id) delete payload.institute_id;
      if (!payload.institute_name) delete payload.institute_name;
      const res = await api.signup(payload);
      if (res.session) {
        login(res.user, res.session.access_token);
      } else {
        onSwitchToLogin();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "0.8rem 1rem",
    background: "var(--surface)", border: "1.5px solid var(--border)",
    borderRadius: "12px", color: "var(--text)", fontSize: "0.9rem",
    outline: "none", fontFamily: "var(--font-body)"
  };

  const isManager = form.role === "manager";

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(ellipse at 30% 40%, #120a2e 0%, var(--bg) 65%)",
      padding: "2rem", overflowY: "auto"
    }}>
      <div style={{ maxWidth: 420, width: "100%", paddingBottom: "2rem" }}>
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(108,99,255,0.12)",
            border: "1px solid rgba(108,99,255,0.25)",
            borderRadius: "20px", padding: "0.3rem 0.85rem",
            fontSize: "0.72rem", fontWeight: 700,
            color: "var(--accent)", letterSpacing: "0.1em",
            textTransform: "uppercase", marginBottom: "1rem"
          }}>AI Sales Trainer</div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: "2.2rem",
            fontWeight: 800, letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #ffffff 30%, rgba(108,99,255,0.9))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>Create Account</div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Join your institute's training program
          </p>
        </div>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

          {[
            { label: "Full Name", field: "name", type: "text", placeholder: "John Doe" },
            { label: "Email", field: "email", type: "email", placeholder: "you@example.com" },
            { label: "Password", field: "password", type: "password", placeholder: "••••••••" },
          ].map(({ label, field, type, placeholder }) => (
            <div key={field}>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                {label}
              </label>
              <input
                type={type} value={form[field]} placeholder={placeholder} required
                onChange={e => set(field, e.target.value)}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
              Role
            </label>
            <select value={form.role} onChange={e => set("role", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="trainee">Trainee</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          {isManager ? (
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                Institute Name
              </label>
              <input
                type="text" value={form.institute_name}
                placeholder="e.g. Aakash Institute, Allen Career"
                onChange={e => set("institute_name", e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                A new institute will be created with this name.
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                Institute ID <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                type="text" value={form.institute_id}
                placeholder="Your institute's ID"
                onChange={e => set("institute_id", e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                Ask your manager for the institute ID to link your account.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: "rgba(255,101,132,0.1)", border: "1px solid rgba(255,101,132,0.3)",
              borderRadius: "10px", padding: "0.7rem 1rem",
              fontSize: "0.83rem", color: "#ff6584"
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "0.9rem",
            background: "linear-gradient(135deg, var(--accent), #9c55ff)",
            border: "none", borderRadius: "12px",
            color: "#fff", fontFamily: "var(--font-display)",
            fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 8px 32px rgba(108,99,255,0.4)",
            opacity: loading ? 0.7 : 1, marginTop: "0.25rem"
          }}>
            {loading ? "Creating account..." : "Create Account →"}
          </button>

          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <button type="button" onClick={onSwitchToLogin} style={{
              background: "none", border: "none", color: "var(--accent)",
              cursor: "pointer", fontWeight: 600, fontSize: "0.85rem"
            }}>
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}