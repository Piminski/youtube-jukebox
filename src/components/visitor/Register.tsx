import { useState, type FormEvent } from "react";
import { registerVisitor } from "../../supabase/api";
import type { Visitor } from "../../supabase/types";

interface RegisterProps {
  onRegistered: (visitor: Visitor) => void;
}

export default function Register({ onRegistered }: RegisterProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const visitor = await registerVisitor(name, email);
      onRegistered(visitor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell visitor-shell">
      <header className="brand-block">
        <p className="eyebrow">Live event</p>
        <h1>YouTube Jukebox</h1>
        <p className="lede">
          Register to browse the queue and add a track for the room.
        </p>
      </header>

      <form className="card-form" onSubmit={submit}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Joining…" : "Join the jukebox"}
        </button>
      </form>
    </div>
  );
}
