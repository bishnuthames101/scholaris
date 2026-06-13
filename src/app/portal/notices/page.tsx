"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Notice = {
  publicId: string;
  subject: string | null;
  bodyEn: string;
  bodyNe: string | null;
  createdAt: string;
  triggerType: string;
};

export default function PortalNoticesPage() {
  const t = useTranslations("portal");
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
      <h1 className="text-2xl font-bold text-foreground">{t("schoolNotices")}</h1>

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
                className="rounded-lg border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {n.subject && (
                      <h2 className="text-base font-semibold text-foreground">{n.subject}</h2>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.bodyEn}</p>
                    {n.bodyNe && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground font-nepali">{n.bodyNe}</p>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {new Date(n.createdAt).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} {t("notices")}</span>
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
