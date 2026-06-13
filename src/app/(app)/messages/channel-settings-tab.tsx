"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { NotificationChannel } from "./types";

const ALL_CHANNELS: NotificationChannel[] = ["whatsapp", "sms", "viber", "push"];

export function ChannelSettingsTab() {
  const t = useTranslations("messages");
  const [priority, setPriority] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    api<{ channelPriority: NotificationChannel[] }>("/api/notifications/channel-settings")
      .then((r) => setPriority(r.data.channelPriority))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...priority];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setPriority(next);
  }

  function moveDown(idx: number) {
    if (idx >= priority.length - 1) return;
    const next = [...priority];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setPriority(next);
  }

  function toggleChannel(ch: NotificationChannel) {
    if (priority.includes(ch)) {
      if (priority.length <= 1) return; // must keep at least 1
      setPriority(priority.filter((c) => c !== ch));
    } else {
      setPriority([...priority, ch]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await api("/api/notifications/channel-settings", {
        method: "PATCH",
        body: JSON.stringify({ channelPriority: priority }),
      });
      setMsg(t("channelSaved"));
    } catch (err) {
      if (err instanceof ClientApiError) setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted">Loading…</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("channelPriority")}</h2>
        <p className="mt-1 text-sm text-muted">{t("channelPriorityHint")}</p>

        <div className="mt-5 space-y-2">
          {priority.map((ch, idx) => (
            <div
              key={ch}
              className="flex items-center justify-between rounded-md border border-border bg-surface-raised px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {idx + 1}
                </span>
                <ChannelIcon channel={ch} />
                <span className="font-medium text-foreground">{t(ch)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="rounded p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx >= priority.length - 1}
                  className="rounded p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => toggleChannel(ch)}
                  className="ml-2 rounded p-1 text-red-400 hover:text-red-600"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Channels not in priority */}
        {ALL_CHANNELS.filter((c) => !priority.includes(c)).length > 0 && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium text-muted">Available channels:</p>
            <div className="flex gap-2">
              {ALL_CHANNELS.filter((c) => !priority.includes(c)).map((ch) => (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted hover:border-brand-400 hover:text-brand-600"
                >
                  + {t(ch)}
                </button>
              ))}
            </div>
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{msg}</div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || priority.length === 0}
          className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "…" : t("channelSaved").replace("saved", "save")}
        </button>
      </div>
    </div>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-700",
    sms: "bg-blue-100 text-blue-700",
    viber: "bg-purple-100 text-purple-700",
    push: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    whatsapp: "WA",
    sms: "SM",
    viber: "VB",
    push: "PN",
  };
  return (
    <span className={cn("flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold", colors[channel])}>
      {labels[channel] ?? "?"}
    </span>
  );
}
