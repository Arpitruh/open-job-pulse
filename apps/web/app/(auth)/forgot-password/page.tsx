"use client";
import { useState } from "react";
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      setMessage(res.ok ? data.message : data.error || "Unable to send reset email.");
    } catch { setMessage("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen bg-blue-50 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-xl shadow max-w-md w-full space-y-5">
    <h1 className="text-2xl font-bold">Forgot password?</h1>
    <p className="text-gray-600">Enter your registered email to receive a password reset link.</p>
    <form onSubmit={submit} className="space-y-4">
      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" className="w-full border rounded-lg p-3" />
      <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg disabled:opacity-60">{loading ? "Sending..." : "Send reset link"}</button>
    </form>
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    <a href="/login" className="text-blue-600 text-sm">Back to sign in</a>
  </div></main>;
}
