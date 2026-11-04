"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, BriefcaseBusiness, CheckCircle2, Lock } from "lucide-react";

export default function ConnectLinkedInPage() {
  const [session, setSession] = useState<{ user?: { identityLockedAt?: string | null; linkedinId?: string | null } } | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((response) => {
        if (!response.ok) throw new Error("Session request failed");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setSession(data?.user ? data : null);
        setStatus(data?.user ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (active) setStatus("unauthenticated");
      });
    return () => { active = false; };
  }, []);

  // If identity already locked, redirect to dashboard
  useEffect(() => {
    if (session?.user?.identityLockedAt) {
      router.push("/dashboard");
    }
  }, [session, router]);

  const alreadyConnected = !!session?.user?.linkedinId;

  async function handleConnect() {
    setLoading(true);
    await signIn("linkedin", {
      callbackUrl: "/onboarding/connect-linkedin",
    });
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <BriefcaseBusiness className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-900">OpenJobPulse</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= 1
                  ? "bg-green-500"
                  : i === 2
                  ? "bg-blue-500"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Connect LinkedIn
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Required to activate your trial. We use your LinkedIn identity to
          prevent duplicate accounts — we never post on your behalf.
        </p>

        {/* Why we need this */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6 space-y-2">
          {[
            "Prevents trial abuse — one account per person",
            "We never access your connections or messages",
            "We never post or apply on your behalf",
            "You can disconnect anytime from settings",
          ].map((point) => (
            <div key={point} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-blue-800">{point}</span>
            </div>
          ))}
        </div>

        {alreadyConnected ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 mb-4">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">LinkedIn connected</p>
              <p className="text-xs text-green-600">
                Activating your trial...
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#0A66C2] text-white rounded-lg py-3 px-4 font-medium hover:bg-[#0958a8] transition-colors disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            )}
            Connect LinkedIn to Activate Trial
          </button>
        )}

        <div className="flex items-center gap-2 mt-4 justify-center">
          <Lock className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs text-gray-400">
            OAuth secured · We only read your public profile ID
          </p>
        </div>
      </div>
    </div>
  );
}