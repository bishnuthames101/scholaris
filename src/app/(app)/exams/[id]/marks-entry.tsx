"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Save, Users } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { computeSubjectGrade, type GradeBandInput, type SubjectGrade } from "@/lib/exams/grading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import type { MarksResponse } from "../types";

type RowDraft = { th: string; pr: string; absent: boolean };

function toDraft(th: unknown, pr: unknown, absent: boolean): RowDraft {
  return {
    th: th === null || th === undefined ? "" : String(Number(th)),
    pr: pr === null || pr === undefined ? "" : String(Number(pr)),
    absent,
  };
}

export function MarksEntry({
  examId,
  examSubjectId,
  locked,
  bands,
  onSaved,
}: {
  examId: string;
  examSubjectId: string;
  locked: boolean;
  bands: GradeBandInput[];
  onSaved: () => void;
}) {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";

  const [data, setData] = useState<MarksResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [initial, setInitial] = useState<Record<string, RowDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  // Note: this component is mounted with key={examSubjectId}, so a subject
  // switch remounts it with fresh (null) state — no manual reset needed.
  useEffect(() => {
    let cancelled = false;
    api<MarksResponse>(`/api/exams/${examId}/marks?examSubject=${examSubjectId}`)
      .then((r) => {
        if (cancelled) return;
        setData(r.data);
        const next: Record<string, RowDraft> = {};
        for (const row of r.data.roster) {
          next[row.student.publicId] = toDraft(row.marksTh, row.marksPr, row.isAbsent);
        }
        setDrafts(next);
        setInitial(next);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [examId, examSubjectId, tc]);

  const es = data?.examSubject ?? null;

  const dirty = useMemo(
    () =>
      Object.keys(drafts).some((id) => {
        const a = drafts[id];
        const b = initial[id];
        return a.th !== (b?.th ?? "") || a.pr !== (b?.pr ?? "") || a.absent !== (b?.absent ?? false);
      }),
    [drafts, initial],
  );

  const invalid = useMemo(() => {
    if (!es) return false;
    return Object.values(drafts).some((d) => {
      const th = d.th.trim() === "" ? null : Number(d.th);
      const pr = d.pr.trim() === "" ? null : Number(d.pr);
      if (th !== null && (Number.isNaN(th) || th < 0 || th > es.fullMarksTh)) return true;
      if (pr !== null && (Number.isNaN(pr) || pr < 0 || pr > (es.fullMarksPr ?? 0))) return true;
      return false;
    });
  }, [drafts, es]);

  function previewFor(d: RowDraft): SubjectGrade | null {
    if (!es) return null;
    const th = d.th.trim() === "" ? null : Number(d.th);
    const pr = d.pr.trim() === "" ? null : Number(d.pr);
    if ((th === null || Number.isNaN(th)) && !d.absent) return null;
    return computeSubjectGrade(
      {
        marksTh: th !== null && Number.isNaN(th) ? null : th,
        marksPr: pr !== null && Number.isNaN(pr) ? null : pr,
        isAbsent: d.absent,
        fullMarksTh: es.fullMarksTh,
        passMarksTh: es.passMarksTh,
        fullMarksPr: es.fullMarksPr,
        passMarksPr: es.passMarksPr,
        hasPractical: es.hasPractical,
      },
      bands,
    );
  }

  function updateRow(studentId: string, patch: Partial<RowDraft>) {
    setDrafts((m) => ({ ...m, [studentId]: { ...m[studentId], ...patch } }));
  }

  function focusNext(col: "th" | "pr", index: number) {
    const next = inputRefs.current.get(`${col}:${index + 1}`);
    if (next) {
      next.focus();
      next.select();
    }
  }

  async function save() {
    if (!data || !es) return;
    const marks = data.roster
      .filter((row) => {
        const d = drafts[row.student.publicId];
        const init = initial[row.student.publicId];
        const hasValue = d.absent || d.th.trim() !== "" || d.pr.trim() !== "";
        const wasSaved =
          (init?.th ?? "") !== "" || (init?.pr ?? "") !== "" || (init?.absent ?? false);
        return hasValue || wasSaved;
      })
      .map((row) => {
        const d = drafts[row.student.publicId];
        return {
          studentId: row.student.publicId,
          marksTh: d.th.trim() === "" ? null : Number(d.th),
          marksPr: d.pr.trim() === "" ? null : Number(d.pr),
          isAbsent: d.absent,
        };
      });
    if (marks.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/exams/${examId}/marks`, {
        method: "PUT",
        body: JSON.stringify({ examSubjectId, marks }),
      });
      setInitial({ ...drafts });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-6 text-brand-600" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Subject header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {es && locale === "ne" && es.subject.nameNe ? es.subject.nameNe : es?.subject.name}
              <span className="ml-1.5 font-normal text-muted">· {es?.class.name}</span>
            </p>
            <p className="text-xs text-muted">
              {es && t("thSummary", { full: es.fullMarksTh, pass: es.passMarksTh })}
              {es?.hasPractical &&
                ` · ${t("prSummary", { full: es.fullMarksPr ?? 0, pass: es.passMarksPr ?? 0 })}`}
            </p>
          </div>
          {dirty && !locked && <Badge tone="warning">{t("unsavedChanges")}</Badge>}
        </div>

        {locked && (
          <p className="flex items-center gap-2 border-b border-border bg-info-bg px-4 py-2.5 text-sm text-info">
            <Lock className="size-4 shrink-0" />
            {t("lockedBanner")}
          </p>
        )}
        {error && (
          <p className="border-b border-border bg-danger-bg px-4 py-2.5 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {data.roster.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title={t("noRoster")} description={t("noRosterHint")} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted/60 text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("roll")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("student")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("theory")}{" "}
                      <span className="font-normal normal-case">/ {es?.fullMarksTh}</span>
                    </th>
                    {es?.hasPractical && (
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("practical")}{" "}
                        <span className="font-normal normal-case">/ {es.fullMarksPr}</span>
                      </th>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("absent")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("grade")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.roster.map((row, i) => {
                    const d = drafts[row.student.publicId];
                    if (!d) return null;
                    const preview = previewFor(d);
                    const thNum = d.th.trim() === "" ? null : Number(d.th);
                    const prNum = d.pr.trim() === "" ? null : Number(d.pr);
                    const thInvalid =
                      thNum !== null &&
                      (Number.isNaN(thNum) || thNum < 0 || thNum > (es?.fullMarksTh ?? 0));
                    const prInvalid =
                      prNum !== null &&
                      (Number.isNaN(prNum) || prNum < 0 || prNum > (es?.fullMarksPr ?? 0));
                    return (
                      <tr key={row.student.publicId} className={cn(d.absent && "bg-surface-muted/40")}>
                        <td className="px-4 py-2 tabular-nums text-muted">{row.rollNo ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className="block truncate font-medium text-foreground">
                            {locale === "ne" && row.student.nameNe
                              ? row.student.nameNe
                              : row.student.name}
                          </span>
                          <span className="text-xs text-faint">
                            {row.student.admissionNo} · {row.section.name}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            ref={(el) => {
                              if (el) inputRefs.current.set(`th:${i}`, el);
                              else inputRefs.current.delete(`th:${i}`);
                            }}
                            inputMode="decimal"
                            value={d.th}
                            disabled={locked || d.absent}
                            onChange={(e) => updateRow(row.student.publicId, { th: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusNext("th", i);
                              }
                            }}
                            aria-invalid={thInvalid || undefined}
                            aria-label={`${row.student.name} ${t("theory")}`}
                            className={cn(
                              "h-8 w-20 rounded-md border bg-surface px-2 text-right text-sm tabular-nums text-foreground",
                              "transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30",
                              "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
                              thInvalid
                                ? "border-danger focus:border-danger focus:ring-danger/20"
                                : "border-border-strong",
                            )}
                          />
                        </td>
                        {es?.hasPractical && (
                          <td className="px-4 py-2">
                            <input
                              ref={(el) => {
                                if (el) inputRefs.current.set(`pr:${i}`, el);
                                else inputRefs.current.delete(`pr:${i}`);
                              }}
                              inputMode="decimal"
                              value={d.pr}
                              disabled={locked || d.absent}
                              onChange={(e) =>
                                updateRow(row.student.publicId, { pr: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  focusNext("pr", i);
                                }
                              }}
                              aria-invalid={prInvalid || undefined}
                              aria-label={`${row.student.name} ${t("practical")}`}
                              className={cn(
                                "h-8 w-20 rounded-md border bg-surface px-2 text-right text-sm tabular-nums text-foreground",
                                "transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30",
                                "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
                                prInvalid
                                  ? "border-danger focus:border-danger focus:ring-danger/20"
                                  : "border-border-strong",
                              )}
                            />
                          </td>
                        )}
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={d.absent}
                            disabled={locked}
                            onChange={(e) =>
                              updateRow(row.student.publicId, { absent: e.target.checked })
                            }
                            className="size-4 accent-brand-600"
                            aria-label={`${row.student.name} ${t("absent")}`}
                          />
                        </td>
                        <td className="px-4 py-2">
                          {preview ? (
                            <Badge tone={preview.isNg ? "danger" : "success"}>
                              {preview.letter} · {preview.gradePoint.toFixed(1)}
                            </Badge>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!locked && (
              <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
                {savedFlash && !dirty && (
                  <span className="text-sm text-success">{t("marksSaved")}</span>
                )}
                <Button onClick={save} loading={saving} disabled={!dirty || invalid}>
                  <Save className="size-4" />
                  {t("saveMarks")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
