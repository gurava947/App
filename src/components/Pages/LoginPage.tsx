import { useState, type FormEvent } from "react";

export function LoginPage({ onLogin, error }: { onLogin: (name: string, email: string) => Promise<void>; error: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      await onLogin(name.trim(), email.trim());
    } catch (loginError) {
      setFormError(loginError instanceof Error ? loginError.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <span className="brand-mark login-mark">IN</span>
      <div className="eyebrow">YOUR LOCAL INBOX</div>
      <h1>Welcome to INChat</h1>
      <p>Sign in to your account, find the other person, and send a connection request. Chats and calls open after they accept.</p>
      <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={60} required /></label>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
      {(formError || error) && <div className="login-error" role="alert">{formError || error}</div>}
      <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? "Connecting…" : "Continue"}</button>
      <small>Local demo login only. No password or external service is used.</small>
    </form>
  </main>;
}
