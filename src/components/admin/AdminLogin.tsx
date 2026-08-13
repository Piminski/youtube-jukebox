import { useState, type FormEvent } from "react";
import { adminSignIn } from "../../supabase/api";
import { navigate } from "../../lib/route";

interface AdminLoginProps {
  onSignedIn: () => void;
}

export default function AdminLogin({ onSignedIn }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSignIn(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="visitor-screen">
      <header className="topbar">
        <span className="brand-pixel">JUKEBOX</span>
        <button
          type="button"
          className="linklike"
          onClick={() => navigate("visitor")}
        >
          ← Visitor site
        </button>
      </header>

      <div className="greeting">
        <h1>Admin.</h1>
        <p className="status-line">Sign in with the event staff account</p>
      </div>

      <form className="card-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
