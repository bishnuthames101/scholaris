"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { NotificationLog } from "./types";

const CHANNELS = ["whatsapp", "sms", "viber", "push"] as const;
const STATUSES = ["pending", "sent", "delivered", "failed"] as const;
const TRIGGERS = ["attendance.absent", "results.published", "rfid.tap", "bulk"] as const;

export function LogTab() {
  const t = useTranslations("messages");
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTrigger, setFilterTrigger] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (filterChannel) params.set("channel", filterChannel);
    if (filterStatus) params.set("status", filterStatus);
    if (filterTrigger) params.set("triggerType", filterTrigger);
    if (search) params.set("search", search);

    api<NotificationLog[]>(`/api/notifications/log?${params}`)
      .then((r) => {
        setLogs(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, filterChannel, filterStatus, filterTrigger, search]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t("phone")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm w-48"
        />
        <select
          value={filterChannel}
          onChange={(e) => { setFilterChannel(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">{t("allChannels")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{t(c)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status_${s}`)}</option>
          ))}
        </select>
        <select
          value={filterTrigger}
          onChange={(e) => { setFilterTrigger(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">{t("allTriggers")}</option>
          {TRIGGERS.map((tr) => (
            <option key={tr} value={tr}>{t(`trigger_${tr}`)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noMessages")}</p>
          <p className="mt-1 text-xs text-muted">{t("noMessagesHint")}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-raised">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("recipient")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("phone")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("channel")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("trigger")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("sentAt")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted">{t("error")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.publicId} className="hover:bg-surface-raised/50">
                    <td className="px-3 py-2.5 text-foreground">{log.recipientName ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{log.recipientPhone ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <ChannelBadge channel={log.channel} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {log.triggerType ? t(`trigger_${log.triggerType}`) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate text-xs text-red-600">
                      {log.errorMessage ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} messages</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-border px-3 py-1 disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-border px-3 py-1 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-800",
    sms: "bg-blue-100 text-blue-800",
    viber: "bg-purple-100 text-purple-800",
    push: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", colors[channel] ?? "bg-gray-100 text-gray-700")}>
      {channel}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    queued: "bg-yellow-100 text-yellow-800",
    sent: "bg-blue-100 text-blue-800",
    delivered: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", colors[status] ?? "bg-gray-100 text-gray-700")}>
      {status}
    </span>
  );
}
