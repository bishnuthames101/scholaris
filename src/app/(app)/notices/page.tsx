"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Notice = {
  publicId: string;
  title: string;
  titleNe: string | null;
  body: string;
  bodyNe: string | null;
  category: string;
  audience: string;
  isPinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  author: { publicId: string; name: string };
  _count: { readReceipts: number };
};

const CATEGORIES = ["general", "academic", "exam", "event", "holiday"];

export default function NoticesPage() {
  const t = useTranslations("notices");
  const tc = useTranslations("common");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Create form
  const [form, setForm] = useState({
    title: "", titleNe: "", body: "", bodyNe: "",
    category: "general", audience: "all", isPinned: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Notice[]>(`/api/notices?page=${page}&pageSize=20`)
      .then((r) => {
        setNotices(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, refreshKey, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/notices", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          titleNe: form.titleNe || undefined,
          bodyNe: form.bodyNe || undefined,
          publishNow: true,
        }),
      });
      setShowCreate(false);
      setForm({ title: "", titleNe: "", body: "", bodyNe: "", category: "general", audience: "all", isPinned: false });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/api/notices/${id}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);

  const categoryBadge: Record<string, string> = {
    general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    academic: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    exam: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    event: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    holiday: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? tc("cancel") : t("createNotice")}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-surface p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("noticeTitle")}</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("noticeTitleNe")}</label>
              <input
                value={form.titleNe}
                onChange={(e) => setForm((f) => ({ ...f, titleNe: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("noticeBody")}</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("noticeBodyNe")}</label>
            <textarea
              value={form.bodyNe}
              onChange={(e) => setForm((f) => ({ ...f, bodyNe: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("category")}</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`cat_${c}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("audience")}</label>
              <select
                value={form.audience}
                onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="all">{t("aud_all")}</option>
                <option value="staff">{t("aud_staff")}</option>
                <option value="parents">{t("aud_parents")}</option>
                <option value="students">{t("aud_students")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
                  className="rounded border-border"
                />
                {t("pinNotice")}
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "..." : t("publish")}
          </button>
        </form>
      )}

      {/* Notices list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : notices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noNotices")}</p>
          <p className="mt-1 text-xs text-muted">{t("noNoticesHint")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {notices.map((n) => (
              <article
                key={n.publicId}
                className={`rounded-lg border bg-surface p-5 shadow-sm ${n.isPinned ? "border-brand-300 dark:border-brand-700" : "border-border"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.isPinned && (
                        <span className="text-xs font-medium text-brand-600">📌</span>
                      )}
                      <h2 className="text-base font-semibold text-foreground">{n.title}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadge[n.category] ?? categoryBadge.general}`}>
                        {t(`cat_${n.category}`)}
                      </span>
                    </div>
                    {n.titleNe && <p className="text-sm text-muted font-nepali">{n.titleNe}</p>}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                    {n.bodyNe && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground font-nepali">{n.bodyNe}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(n.publicId)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    {tc("delete")}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                  <span>{n.author.name}</span>
                  <span>{t("audience")}: {t(`aud_${n.audience}`)}</span>
                  <span>{n._count.readReceipts} {t("reads")}</span>
                  <span>
                    {new Date(n.publishedAt ?? n.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} {t("title").toLowerCase()}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded border border-border px-3 py-1 disabled:opacity-30">{tc("previous")}</button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded border border-border px-3 py-1 disabled:opacity-30">{tc("next")}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
