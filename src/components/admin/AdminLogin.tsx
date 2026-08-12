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
    <div className="shell admin-login">
      <header className="brand-block">
        <p className="eyebrow">Staff</p>
        <h1>Jukebox admin</h1>
        <p className="lede">Sign in with the event staff Supabase account.</p>
      </header>
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
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate("visitor")}
        >
          Back to visitor
        </button>
      </form>
    </div>
  );
}
