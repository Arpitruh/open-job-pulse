"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Mail } from "lucide-react";

interface Props {
  telegramChatId: string | null;
  emailDigest: string;
}

export default function NotificationSettings({
  telegramChatId,
  emailDigest,
}: Props) {
  const router = useRouter();
  const [chatId, setChatId] = useState(telegramChatId ?? "");
  const [digest, setDigest] = useState(emailDigest);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramChatId: chatId || null,
          emailDigest: digest,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Notification settings saved");
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Notifications</h1>

      {/* Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-500" />
          Telegram Alerts
        </h2>
        <p className="text-xs text-gray-500">
          Get instant push alerts with inline action buttons when new matches
          are found.
        </p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p className="font-medium">Setup:</p>
          <p>
            1. Search{" "}
            <a
              href="https://t.me/OpenJobPulseBot"
              target="_blank"
              className="text-blue-600 font-medium"
            >
              @OpenJobPulseBot
            </a>{" "}
            on Telegram
          </p>
          <p>2. Send /start to get your Chat ID</p>
          <p>3. Paste the Chat ID below</p>
        </div>
        <input
          type="text"
          placeholder="e.g. 123456789"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Email digest */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-400" />
          Email Digest
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "instant", label: "Instant", desc: "Every new match" },
            { value: "daily", label: "Daily", desc: "8am every day" },
            { value: "weekly", label: "Weekly", desc: "Monday mornings" },
            { value: "none", label: "None", desc: "Email disabled" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDigest(opt.value)}
              className={`p-3 rounded-xl border-2 text-left transition-colors ${
                digest === opt.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  digest === opt.value ? "text-blue-700" : "text-gray-700"
                }`}
              >
                {opt.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Notification Settings
      </button>
    </div>
  );
}