"use client";

import { useEffect, useState } from "react";
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
  publishedAt: string;
  author: { name: string };
};

const categoryBadge: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  academic: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  exam: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  event: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  holiday: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function PortalNoticesPage() {
  const t = useTranslations("notices");
  const tc = useTranslations("common");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Notice[]>(`/api/portal/notices?page=${page}&pageSize=20`)
      .then((r) => {
        setNotices(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

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
                      {n.isPinned && <span className="text-xs font-medium text-brand-600">📌</span>}
                      <h2 className="text-base font-semibold text-foreground">{n.title}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadge[n.category] ?? categoryBadge.general}`}>
                        {t(`cat_${n.category}`)}
                      </span>
                    </div>
                    {n.titleNe && <p className="text-sm text-muted font-nepali">{n.titleNe}</p>}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                    {n.bodyNe && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground font-nepali">{n.bodyNe}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                  <span>{n.author.name}</span>
                  <span>
                    {new Date(n.publishedAt).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
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
