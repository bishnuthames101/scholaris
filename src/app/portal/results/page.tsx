"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type SubjectResult = {
  name: string;
  nameNe: string | null;
  marksTh: number | null;
  marksPr: number | null;
  fullMarksTh: number;
  fullMarksPr: number | null;
  passMarksTh: number;
  passMarksPr: number | null;
  percent: number | null;
  gradeLetter: string | null;
  gradePoint: number | null;
  isAbsent: boolean;
};

type ExamResult = {
  publicId: string;
  examName: string;
  examPublicId: string;
  academicYear: string;
  gpa: number;
  status: string;
  ngCount: number;
  computedAt: string;
  subjects: SubjectResult[];
};

export default function PortalResultsPage() {
  const t = useTranslations("portal");
  const params = useSearchParams();
  const studentId = params.get("student");
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api<ExamResult[]>(`/api/portal/results?student=${studentId}`)
      .then((r) => setResults(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return <p className="py-12 text-center text-sm text-muted">{t("selectChild")}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t("examResults")}</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noResults")}</p>
          <p className="mt-1 text-xs text-muted">{t("noResultsHint")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((r) => {
            const expanded = expandedExam === r.publicId;
            return (
              <div key={r.publicId} className="rounded-xl border border-border bg-surface shadow-sm">
                {/* Exam header */}
                <button
                  onClick={() => setExpandedExam(expanded ? null : r.publicId)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{r.examName}</h2>
                    <p className="text-xs text-muted">{r.academicYear}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-brand-700">{r.gpa.toFixed(2)}</p>
                    <span className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      r.status === "passed" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
                    )}>
                      {r.status === "passed" ? t("passed") : `${t("failed")} (${r.ngCount} NG)`}
                    </span>
                  </div>
                </button>

                {/* Subject details */}
                {expanded && (
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-surface-raised">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium text-muted">{t("subject")}</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted">{t("theory")}</th>
                            {r.subjects.some((s) => s.fullMarksPr) && (
                              <th className="px-4 py-2.5 text-center font-medium text-muted">{t("practical")}</th>
                            )}
                            <th className="px-4 py-2.5 text-center font-medium text-muted">{t("grade")}</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted">GP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {r.subjects.map((sub, i) => {
                            const isNG = sub.gradeLetter === "NG";
                            return (
                              <tr key={i} className={cn(isNG && "bg-red-50/50")}>
                                <td className="px-4 py-2.5 font-medium text-foreground">{sub.name}</td>
                                <td className="px-4 py-2.5 text-center font-mono text-foreground">
                                  {sub.isAbsent ? (
                                    <span className="text-red-500">Abs</span>
                                  ) : sub.marksTh !== null ? (
                                    `${sub.marksTh}/${sub.fullMarksTh}`
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                {r.subjects.some((s) => s.fullMarksPr) && (
                                  <td className="px-4 py-2.5 text-center font-mono text-foreground">
                                    {sub.marksPr !== null ? `${sub.marksPr}/${sub.fullMarksPr}` : "—"}
                                  </td>
                                )}
                                <td className="px-4 py-2.5 text-center">
                                  <span className={cn(
                                    "inline-block rounded px-1.5 py-0.5 text-xs font-bold",
                                    isNG ? "bg-red-100 text-red-700" : "bg-brand-50 text-brand-700",
                                  )}>
                                    {sub.gradeLetter ?? "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center font-mono text-foreground">
                                  {sub.gradePoint?.toFixed(1) ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                      <span className="text-sm font-medium text-muted">GPA</span>
                      <span className="text-lg font-bold text-brand-700">{r.gpa.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
