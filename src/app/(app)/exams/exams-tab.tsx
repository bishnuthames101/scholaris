"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { GraduationCap, Plus } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BsDate } from "@/components/bs-date";
import type { AcademicYearOption, ExamListRow, ExamStatus, ExamType, GradeScaleRow } from "./types";

const PAGE_SIZE = 20;
const TYPES: ExamType[] = ["unit", "terminal", "board"];
const TYPE_TONE: Record<ExamType, "neutral" | "brand" | "info"> = {
  unit: "neutral",
  terminal: "brand",
  board: "info",
};
const STATUS_TONE: Record<ExamStatus, "warning" | "success"> = {
  draft: "warning",
  published: "success",
};

export function ExamsTab() {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";
  const router = useRouter();

  // List state
  const [rows, setRows] = useState<ExamListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reference data
  const [years, setYears] = useState<AcademicYearOption[]>([]);
  const [scales, setScales] = useState<GradeScaleRow[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [type, setType] = useState<ExamType>("terminal");
  const [yearId, setYearId] = useState("");
  const [scaleId, setScaleId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (yearFilter) params.set("academicYear", yearFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    api<ExamListRow[]>(`/api/exams?${params}`)
      .then((r) => {
        if (cancelled) return;
        setRows(r.data);
        setTotal(r.meta?.total ?? r.data.length);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [page, yearFilter, statusFilter, typeFilter, refreshKey, tc]);

  useEffect(() => {
    api<AcademicYearOption[]>("/api/academic-years")
      .then((r) => setYears(r.data))
      .catch(() => {});
    api<GradeScaleRow[]>("/api/exams/grade-scales")
      .then((r) => setScales(r.data))
      .catch(() => {});
  }, []);

  function openCreate() {
    setName("");
    setNameNe("");
    setType("terminal");
    setYearId(years.find((y) => y.isCurrent)?.publicId ?? years[0]?.publicId ?? "");
    setScaleId(scales.find((s) => s.isDefault)?.publicId ?? "");
    setStartsAt("");
    setEndsAt("");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function createExam() {
    if (!name.trim() || !yearId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await api<ExamListRow>("/api/exams", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          nameNe: nameNe.trim() || undefined,
          type,
          academicYearId: yearId,
          ...(scaleId ? { gradeScaleId: scaleId } : {}),
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        }),
      });
      setCreateOpen(false);
      setRefreshKey((k) => k + 1);
      router.push(`/exams/${data.publicId}`);
    } catch (e) {
      setCreateError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t("academicYear")}
          >
            <option value="">{t("allYears")}</option>
            {years.map((y) => (
              <option key={y.publicId} value={y.publicId}>
                {y.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t("status")}
          >
            <option value="">{t("allStatuses")}</option>
            <option value="draft">{t("status_draft")}</option>
            <option value="published">{t("status_published")}</option>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t("type")}
          >
            <option value="">{t("allTypes")}</option>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`type_${x}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            {t("createExam")}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* List */}
      {!rows ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={t("noExams")}
          description={t("noExamsHint")}
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              {t("createExam")}
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("exam")}</TH>
              <TH>{t("academicYear")}</TH>
              <TH>{t("type")}</TH>
              <TH>{t("dates")}</TH>
              <TH className="text-right">{t("subjects")}</TH>
              <TH className="text-right">{t("marks")}</TH>
              <TH>{t("status")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR
                key={row.publicId}
                interactive
                onClick={() => router.push(`/exams/${row.publicId}`)}
              >
                <TD>
                  <span className="block truncate font-medium">
                    {locale === "ne" && row.nameNe ? row.nameNe : row.name}
                  </span>
                  <span className="text-xs text-faint">{row.gradeScale.name}</span>
                </TD>
                <TD>{row.academicYear.name}</TD>
                <TD>
                  <Badge tone={TYPE_TONE[row.type]}>{t(`type_${row.type}`)}</Badge>
                </TD>
                <TD className="whitespace-nowrap">
                  {row.startsAt ? <BsDate date={row.startsAt} showAd={false} /> : "—"}
                </TD>
                <TD className="text-right tabular-nums">{row._count.subjects}</TD>
                <TD className="text-right tabular-nums">{row._count.marks}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[row.status]}>{t(`status_${row.status}`)}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("createExam")}>
        <div className="space-y-4">
          {createError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {createError}
            </p>
          )}
          <Field label={t("examName")} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("examNamePlaceholder")}
              autoFocus
            />
          </Field>
          <Field label={t("examNameNe")}>
            <Input value={nameNe} onChange={(e) => setNameNe(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("type")} required>
              <Select value={type} onChange={(e) => setType(e.target.value as ExamType)}>
                {TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`type_${x}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("academicYear")} required>
              <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
                <option value="">{t("academicYear")}…</option>
                {years.map((y) => (
                  <option key={y.publicId} value={y.publicId}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("gradeScale")}>
            <Select value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
              {scales.map((s) => (
                <option key={s.publicId} value={s.publicId}>
                  {s.name}
                  {s.isDefault ? ` — ${t("defaultScale")}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("startsAt")}>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label={t("endsAt")}>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={createExam} loading={creating} disabled={!name.trim() || !yearId}>
              {tc("create")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
