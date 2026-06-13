"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type HomeworkItem = {
  publicId: string;
  title: string;
  titleNe: string | null;
  description: string | null;
  descriptionNe: string | null;
  dueDate: string;
  section: { publicId: string; name: string; class: { name: string } };
  subject: { publicId: string; name: string; nameNe: string | null };
  staff: { name: string };
  submissions?: {
    publicId: string;
    submittedAt: string;
    grade: string | null;
    comment: string | null;
    commentedAt: string | null;
  }[];
};

export default function PortalHomeworkPage() {
  const t = useTranslations("homework");
  const tc = useTranslations("common");
  const [items, setItems] = useState<HomeworkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<HomeworkItem[]>(`/api/portal/homework?page=${page}&pageSize=20`)
      .then((r) => {
        if (cancelled) return;
        setItems(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, tc]);

  const totalPages = Math.ceil(total / 20);

  function dueLabel(d: string): { text: string; color: string } {
    const due = new Date(d);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return { text: t("overdue"), color: "text-red-600" };
    if (diff === 0) return { text: t("dueToday"), color: "text-amber-600" };
    if (diff <= 2) return { text: `${diff}d`, color: "text-amber-600" };
    return { text: `${diff}d`, color: "text-green-600" };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noHomework")}</p>
          <p className="mt-1 text-xs text-muted">{t("noHomeworkHint")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((hw) => {
              const due = dueLabel(hw.dueDate);
              const sub = hw.submissions?.[0];
              return (
                <div key={hw.publicId} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground">{hw.title}</h3>
                      {hw.titleNe && <p className="text-sm text-muted font-nepali">{hw.titleNe}</p>}
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        <span>{hw.section.class.name} {hw.section.name}</span>
                        <span>·</span>
                        <span>{hw.subject.name}</span>
                        <span>·</span>
                        <span>{hw.staff.name}</span>
                      </div>
                      {hw.description && (
                        <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{hw.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-medium ${due.color}`}>
                        {t("due")}: {new Date(hw.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </div>
                      <span className={`text-xs ${due.color}`}>{due.text}</span>
                    </div>
                  </div>

                  {/* Submission status */}
                  {sub ? (
                    <div className="mt-3 rounded-md bg-green-50 dark:bg-green-950 p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-green-700 dark:text-green-300">{t("submitted")}</span>
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {new Date(sub.submittedAt).toLocaleDateString("en-GB")}
                        </span>
                        {sub.grade && (
                          <span className="ml-auto rounded-full bg-green-200 dark:bg-green-800 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                            {sub.grade}
                          </span>
                        )}
                      </div>
                      {sub.comment && (
                        <p className="mt-1 text-sm text-green-700 dark:text-green-300">{t("teacherComment")}: {sub.comment}</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950 p-2">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{t("notSubmitted")}</span>
                    </div>
                  )}
                </div>
              );
            })}
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
