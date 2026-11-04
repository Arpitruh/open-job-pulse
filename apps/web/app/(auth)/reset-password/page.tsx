"use client";
import { useEffect, useState } from "react";
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    setToken(url.searchParams.get("token") || "");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await res.json();
      setMessage(data.message || data.error || "Unable to reset password.");
      setSuccess(res.ok);
    } catch { setMessage("Something went wrong."); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen bg-blue-50 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-xl shadow max-w-md w-full space-y-5">
    <h1 className="text-2xl font-bold">Reset password</h1>
    {success ? <a className="text-blue-600" href="/login">Sign in with your new password</a> : <form onSubmit={submit} className="space-y-4">
      <input type="password" minLength={8} maxLength={128} required placeholder="New password (at least 8 characters)" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg p-3" />
      <input type="password" required placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full border rounded-lg p-3" />
      <button disabled={loading || !token} className="w-full bg-blue-600 text-white p-3 rounded-lg disabled:opacity-60">{loading ? "Updating..." : "Reset password"}</button>
    </form>}
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    <a href="/forgot-password" className="text-blue-600 text-sm">Request a new link</a>
  </div></main>;
}
