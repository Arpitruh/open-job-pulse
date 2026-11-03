"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  Zap,
  Key,
} from "lucide-react";

interface Props {
  hasKey: boolean;
  provider: string | null;
  creditBalance: number;
  creditsLifetime: number;
}

export default function AiKeysSettings({
  hasKey,
  provider,
  creditBalance,
  creditsLifetime,
}: Props) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);

  function detectProvider(key: string): string {
    if (key.startsWith("sk-ant-")) return "Anthropic Claude";
    if (key.startsWith("sk-")) return "OpenAI";
    return "Unknown";
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("API key saved securely");
      setApiKey("");
      router.refresh();
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your API key? AI features will stop working.")) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/profile/ai-key", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("API key removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove key");
    } finally {
      setRemoving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/profile/ai-key/test", { method: "POST" });
      const data = await res.json();
      if (data.valid) {
        toast.success(`Key works — detected: ${data.provider}`);
      } else {
        toast.error(`Key test failed: ${data.error}`);
      }
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">AI Keys</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your key is encrypted with AES-256 and never leaves your account
        </p>
      </div>

      {/* Current key status */}
      {hasKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-900 text-sm">
                  API key connected
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  Provider:{" "}
                  {provider === "openai"
                    ? "OpenAI GPT-4o"
                    : provider === "anthropic"
                    ? "Anthropic Claude"
                    : "Auto-detected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-100 transition-colors"
              >
                {testing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Test"
                )}
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                {removing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add key */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-400" />
          {hasKey ? "Replace API Key" : "Connect API Key"}
        </h2>

        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            placeholder="sk-... or sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showKey ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        {apiKey && (
          <p className="text-xs text-gray-500">
            Detected provider:{" "}
            <span className="font-medium">{detectProvider(apiKey)}</span>
          </p>
        )}

        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs text-gray-500">
          <p className="font-medium text-gray-700">Where to get your key:</p>
          <p>
            🔵 OpenAI:{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              platform.openai.com/api-keys
            </a>
          </p>
          <p>
            🟠 Anthropic:{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              console.anthropic.com/settings/keys
            </a>
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Key Securely
        </button>
      </div>

      {/* Credit balance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-blue-500" />
          Credit Balance
        </h2>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-4xl font-bold text-gray-900">
            {creditBalance}
          </span>
          <span className="text-gray-500">credits remaining</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
          <div
            className={`h-2 rounded-full ${
              creditBalance > 30 ? "bg-blue-500" : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(100, (creditBalance / 150) * 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-gray-500 mt-4">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="font-semibold text-gray-900">10 cr</p>
            <p>Cover Letter</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="font-semibold text-gray-900">15 cr</p>
            <p>Resume Score</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="font-semibold text-gray-900">20 cr</p>
            <p>Skills Gap</p>
          </div>
        </div>
      </div>
    </div>
  );
}