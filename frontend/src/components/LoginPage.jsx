import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function LoginPage({ onSwitchToSignup }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      login(res.user, res.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(ellipse at 30% 40%, #120a2e 0%, var(--bg) 65%)",
      padding: "2rem"
    }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
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
          }}>Welcome back</div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Sign in to continue your training
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              style={{
                width: "100%", padding: "0.8rem 1rem",
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: "12px", color: "var(--text)", fontSize: "0.9rem",
                outline: "none", fontFamily: "var(--font-body)"
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{
                width: "100%", padding: "0.8rem 1rem",
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: "12px", color: "var(--text)", fontSize: "0.9rem",
                outline: "none", fontFamily: "var(--font-body)"
              }}
            />
          </div>

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
            opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>

          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Don't have an account?{" "}
            <button type="button" onClick={onSwitchToSignup} style={{
              background: "none", border: "none", color: "var(--accent)",
              cursor: "pointer", fontWeight: 600, fontSize: "0.85rem"
            }}>
              Sign up
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}