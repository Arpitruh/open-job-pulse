"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X, Upload } from "lucide-react";

interface Profile {
  fullName: string;
  headline: string | null;
  parsedSkills: string[];
  targetTitles: string[];
  excludedTerms: string[];
  minimumSalary: number | null;
  preferredMode: string;
  rawResumeText: string | null;
}

interface Props {
  userId: string;
  email: string;
  profile: Profile | null;
}

export default function ProfileSettings({ userId, email, profile }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "",
    headline: profile?.headline ?? "",
    minimumSalary: profile?.minimumSalary?.toString() ?? "",
    preferredMode: profile?.preferredMode ?? "REMOTE",
  });

  const [skills, setSkills] = useState<string[]>(profile?.parsedSkills ?? []);
  const [targetTitles, setTargetTitles] = useState<string[]>(
    profile?.targetTitles ?? []
  );
  const [excludedTerms, setExcludedTerms] = useState<string[]>(
    profile?.excludedTerms ?? []
  );
  const [newSkill, setNewSkill] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newExcluded, setNewExcluded] = useState("");

  function addToList(
    list: string[],
    setList: (v: string[]) => void,
    value: string,
    setValue: (v: string) => void
  ) {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setValue("");
  }

  function removeFromList(
    list: string[],
    setList: (v: string[]) => void,
    item: string
  ) {
    setList(list.filter((i) => i !== item));
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch("/api/profile/resume", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }

      setSkills(data.parsedSkills ?? []);
      toast.success(
        `Resume parsed — ${data.parsedSkills?.length ?? 0} skills extracted`
      );
      router.refresh();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          minimumSalary: form.minimumSalary
            ? parseInt(form.minimumSalary)
            : null,
          parsedSkills: skills,
          targetTitles,
          excludedTerms,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Profile saved");
      router.refresh();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">{email}</p>
      </div>

      {/* Basic info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Basic Info</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Headline
          </label>
          <input
            type="text"
            placeholder="e.g. Senior Software Engineer · Distributed Systems"
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Resume upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Resume</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              PDF, DOCX, or Markdown — we extract skills automatically
            </p>
          </div>
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload Resume
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt"
              onChange={handleResumeUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
        {profile?.rawResumeText && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 max-h-24 overflow-y-auto">
            {profile.rawResumeText.slice(0, 300)}…
          </div>
        )}
      </div>

      {/* Job preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Job Preferences</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Salary (USD/year)
            </label>
            <input
              type="number"
              placeholder="e.g. 150000"
              value={form.minimumSalary}
              onChange={(e) =>
                setForm({ ...form, minimumSalary: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work Mode
            </label>
            <select
              value={form.preferredMode}
              onChange={(e) =>
                setForm({ ...form, preferredMode: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ON_SITE">On-site</option>
            </select>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">Skills</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add skill (e.g. Kubernetes)"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                addToList(skills, setSkills, newSkill, setNewSkill);
            }}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() =>
              addToList(skills, setSkills, newSkill, setNewSkill)
            }
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >
              {skill}
              <button onClick={() => removeFromList(skills, setSkills, skill)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Target titles */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Target Titles</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Use * as wildcard — e.g. *Staff Engineer*, *Distributed*
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. *Senior Backend*"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                addToList(
                  targetTitles,
                  setTargetTitles,
                  newTitle,
                  setNewTitle
                );
            }}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() =>
              addToList(
                targetTitles,
                setTargetTitles,
                newTitle,
                setNewTitle
              )
            }
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {targetTitles.map((title) => (
            <span
              key={title}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-mono"
            >
              {title}
              <button
                onClick={() =>
                  removeFromList(targetTitles, setTargetTitles, title)
                }
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Exclusion terms */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">
            Exclusion Keywords
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Jobs containing these terms will be filtered out
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Clearance Required"
            value={newExcluded}
            onChange={(e) => setNewExcluded(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                addToList(
                  excludedTerms,
                  setExcludedTerms,
                  newExcluded,
                  setNewExcluded
                );
            }}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() =>
              addToList(
                excludedTerms,
                setExcludedTerms,
                newExcluded,
                setNewExcluded
              )
            }
            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {excludedTerms.map((term) => (
            <span
              key={term}
              className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-sm"
            >
              {term}
              <button
                onClick={() =>
                  removeFromList(excludedTerms, setExcludedTerms, term)
                }
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Profile
      </button>
    </div>
  );
}