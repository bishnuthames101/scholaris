"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileDown, Trophy } from "lucide-react";
import { api } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ResultsResponse } from "../types";

export function ResultsSection({
  examId,
  classes,
}: {
  examId: string;
  classes: { publicId: string; name: string; nameNe?: string | null }[];
}) {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";

  const [data, setData] = useState<ResultsResponse | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Keeps the previous table visible while a re-filter is in flight.
  useEffect(() => {
    let cancelled = false;
    const params = classFilter ? `?class=${classFilter}` : "";
    api<ResultsResponse>(`/api/exams/${examId}/results${params}`)
      .then((r) => {
        if (cancelled) return;
        setData(r.data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [examId, classFilter, tc]);

  const results = data?.results ?? [];
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("results")}</h2>
        <div className="w-44">
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label={t("class")}
          >
            <option value="">{t("allClasses")}</option>
            {classes.map((c) => (
              <option key={c.publicId} value={c.publicId}>
                {locale === "ne" && c.nameNe ? c.nameNe : c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!data ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={Trophy} title={t("noResults")} />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("studentsCount")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {results.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("passedCount")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-success">{passed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("failedCount")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-danger">{failed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("passRate")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {passRate}%
                </p>
              </CardContent>
            </Card>
          </div>

          <Table>
            <THead>
              <tr>
                <TH className="text-right">{t("rank")}</TH>
                <TH>{t("roll")}</TH>
                <TH>{t("student")}</TH>
                <TH>{t("class")}</TH>
                <TH className="text-right">{t("gpa")}</TH>
                <TH className="text-right">{t("ngCount")}</TH>
                <TH>{t("result")}</TH>
                <TH className="text-right">{t("marksheet")}</TH>
              </tr>
            </THead>
            <TBody>
              {results.map((r, i) => (
                <TR key={r.publicId}>
                  <TD className="text-right tabular-nums font-medium">{i + 1}</TD>
                  <TD className="tabular-nums">{r.rollNo ?? "—"}</TD>
                  <TD>
                    <span className="block truncate font-medium">
                      {locale === "ne" && r.student.nameNe ? r.student.nameNe : r.student.name}
                    </span>
                    <span className="text-xs text-faint">{r.student.admissionNo}</span>
                  </TD>
                  <TD>
                    {r.class ? r.class.name : "—"}
                    {r.section && <span className="text-xs text-faint"> · {r.section.name}</span>}
                  </TD>
                  <TD className="text-right tabular-nums font-semibold">
                    {Number(r.gpa).toFixed(2)}
                  </TD>
                  <TD className="text-right tabular-nums">{r.ngCount > 0 ? r.ngCount : "—"}</TD>
                  <TD>
                    <Badge tone={r.status === "passed" ? "success" : "danger"}>
                      {t(`result_${r.status}`)}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <a
                      href={`/api/exams/${examId}/marksheets/${r.student.publicId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      aria-label={t("marksheet")}
                    >
                      <FileDown className="size-4" />
                      {t("marksheet")}
                    </a>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
