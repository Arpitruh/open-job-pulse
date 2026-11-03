"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Phone, MessageCircle, BriefcaseBusiness } from "lucide-react";

type Step = "enter-phone" | "enter-code";
type Channel = "sms" | "whatsapp";

export default function VerifyPhonePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("enter-phone");
  const [channel, setChannel] = useState<Channel>("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, channel }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to send code");
        return;
      }

      toast.success(data.message);
      setStep("enter-code");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Invalid code");
        return;
      }

      toast.success("Phone verified!");

      if (data.identityLocked) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding/connect-linkedin");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
          {["Account", "Phone", "LinkedIn", "Done"].map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full ${
                  i === 0
                    ? "bg-green-500"
                    : i === 1
                    ? "bg-blue-500"
                    : "bg-gray-200"
                }`}
              />
            </div>
          ))}
        </div>

        {step === "enter-phone" ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Verify your phone
            </h1>
            <p className="text-gray-500 text-sm mb-6">
              We use this to prevent duplicate accounts. Choose how you&apos;d like to receive your code.
            </p>

            {/* Channel selector */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setChannel("sms")}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  channel === "sms"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <Phone className="w-4 h-4" />
                SMS
              </button>
              <button
                type="button"
                onClick={() => setChannel("whatsapp")}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  channel === "whatsapp"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Include country code, e.g. +91 for India
                </p>
              </div>
              <button
                type="submit"
                disabled={loading || !phone}
                className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Code via {channel === "whatsapp" ? "WhatsApp" : "SMS"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Enter verification code
            </h1>
            <p className="text-gray-500 text-sm mb-6">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-gray-700">{phone}</span> via{" "}
              {channel === "whatsapp" ? "WhatsApp" : "SMS"}.
            </p>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  6-digit Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify Code
              </button>
            </form>

            <button
              onClick={() => { setStep("enter-phone"); setCode(""); }}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              ← Use a different number
            </button>
          </>
        )}
      </div>
    </div>
  );
}