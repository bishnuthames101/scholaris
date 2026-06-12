"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { GradeBandInput } from "@/lib/exams/grading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { BsDate } from "@/components/bs-date";
import type { ClassOption } from "../../students/types";
import type { ExamDetail, ExamSubjectRow, ExamType, PublishResult } from "../types";
import { MarksEntry } from "./marks-entry";
import { ResultsSection } from "./results-section";

const TYPES: ExamType[] = ["unit", "terminal", "board"];

export function ExamDetailClient({ id }: { id: string }) {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";
  const router = useRouter();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [resultsKey, setResultsKey] = useState(0);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNameNe, setEditNameNe] = useState("");
  const [editType, setEditType] = useState<ExamType>("terminal");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Publish / unlock dialogs
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Add class subjects dialog
  const [addOpen, setAddOpen] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [addClassId, setAddClassId] = useState("");
  const [addExamDate, setAddExamDate] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Subject config dialog
  const [configRow, setConfigRow] = useState<ExamSubjectRow | null>(null);
  const [cfgFullTh, setCfgFullTh] = useState("");
  const [cfgPassTh, setCfgPassTh] = useState("");
  const [cfgPractical, setCfgPractical] = useState(false);
  const [cfgFullPr, setCfgFullPr] = useState("");
  const [cfgPassPr, setCfgPassPr] = useState("");
  const [cfgExamDate, setCfgExamDate] = useState("");
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ExamDetail>(`/api/exams/${id}`)
      .then((r) => {
        setExam(r.data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")));
  }, [id, tc]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, []);

  const bands = useMemo<GradeBandInput[]>(
    () =>
      (exam?.gradeScale.bands ?? []).map((b) => ({
        letter: b.letter,
        gradePoint: Number(b.gradePoint),
        minPercent: Number(b.minPercent),
        maxPercent: Number(b.maxPercent),
        isPassing: b.isPassing,
      })),
    [exam],
  );

  const groups = useMemo(() => {
    const map = new Map<string, { cls: ExamSubjectRow["class"]; subjects: ExamSubjectRow[] }>();
    for (const s of exam?.subjects ?? []) {
      const g = map.get(s.class.publicId) ?? { cls: s.class, subjects: [] };
      g.subjects.push(s);
      map.set(s.class.publicId, g);
    }
    return [...map.values()].sort((a, b) => a.cls.gradeLevel - b.cls.gradeLevel);
  }, [exam]);

  const selected = exam?.subjects.find((s) => s.publicId === selectedSubject) ?? null;
  const isDraft = exam?.status === "draft";
  const isPublished = exam?.status === "published";
  const totalMarks = exam?.subjects.reduce((sum, s) => sum + s._count.marks, 0) ?? 0;

  function openEdit() {
    if (!exam) return;
    setEditName(exam.name);
    setEditNameNe(exam.nameNe ?? "");
    setEditType(exam.type);
    setEditStartsAt(exam.startsAt ? exam.startsAt.slice(0, 10) : "");
    setEditEndsAt(exam.endsAt ? exam.endsAt.slice(0, 10) : "");
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await api(`/api/exams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          nameNe: editNameNe.trim() || null,
          type: editType,
          startsAt: editStartsAt || null,
          endsAt: editEndsAt || null,
        }),
      });
      setEditOpen(false);
      load();
    } catch (e) {
      setEditError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteExam() {
    if (!exam || !window.confirm(t("deleteExamConfirm", { name: exam.name }))) return;
    try {
      await api(`/api/exams/${id}`, { method: "DELETE" });
      router.push("/exams");
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    }
  }

  async function publish() {
    setPublishBusy(true);
    setPublishError(null);
    try {
      const { data } = await api<PublishResult>(`/api/exams/${id}/publish`, { method: "POST" });
      setPublishOpen(false);
      setNotice(
        t("publishResult", { students: data.students, passed: data.passed, failed: data.failed }),
      );
      setResultsKey((k) => k + 1);
      load();
    } catch (e) {
      setPublishError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setPublishBusy(false);
    }
  }

  async function unlock() {
    if (unlockReason.trim().length < 3) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      await api(`/api/exams/${id}/unlock`, {
        method: "POST",
        body: JSON.stringify({ reason: unlockReason.trim() }),
      });
      setUnlockOpen(false);
      setUnlockReason("");
      setNotice(t("unlocked"));
      load();
    } catch (e) {
      setUnlockError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setUnlockBusy(false);
    }
  }

  async function addClassSubjects() {
    if (!addClassId) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const { data } = await api<{ added: number; restored: number; skipped: number }>(
        `/api/exams/${id}/subjects`,
        {
          method: "POST",
          body: JSON.stringify({
            classId: addClassId,
            ...(addExamDate ? { examDate: addExamDate } : {}),
          }),
        },
      );
      setAddOpen(false);
      setNotice(
        t("addSubjectsResult", {
          added: data.added,
          restored: data.restored,
          skipped: data.skipped,
        }),
      );
      load();
    } catch (e) {
      setAddError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setAddBusy(false);
    }
  }

  function openConfig(row: ExamSubjectRow) {
    setCfgFullTh(String(row.fullMarksTh));
    setCfgPassTh(String(row.passMarksTh));
    setCfgPractical(row.hasPractical);
    setCfgFullPr(row.fullMarksPr !== null ? String(row.fullMarksPr) : "");
    setCfgPassPr(row.passMarksPr !== null ? String(row.passMarksPr) : "");
    setCfgExamDate(row.examDate ? row.examDate.slice(0, 10) : "");
    setCfgError(null);
    setConfigRow(row);
  }

  async function saveConfig() {
    if (!configRow) return;
    setCfgBusy(true);
    setCfgError(null);
    try {
      await api(`/api/exams/${id}/subjects/${configRow.publicId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullMarksTh: Number(cfgFullTh),
          passMarksTh: Number(cfgPassTh),
          hasPractical: cfgPractical,
          ...(cfgPractical
            ? { fullMarksPr: Number(cfgFullPr), passMarksPr: Number(cfgPassPr) }
            : {}),
          ...(cfgExamDate ? { examDate: cfgExamDate } : {}),
        }),
      });
      setConfigRow(null);
      load();
    } catch (e) {
      setCfgError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setCfgBusy(false);
    }
  }

  async function removeSubject(row: ExamSubjectRow) {
    const label = locale === "ne" && row.subject.nameNe ? row.subject.nameNe : row.subject.name;
    if (!window.confirm(t("removeSubjectConfirm", { name: label }))) return;
    try {
      await api(`/api/exams/${id}/subjects/${row.publicId}`, { method: "DELETE" });
      if (selectedSubject === row.publicId) setSelectedSubject(null);
      load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    }
  }

  if (error && !exam) {
    return (
      <div className="space-y-4">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToExams")}
        </Link>
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToExams")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {locale === "ne" && exam.nameNe ? exam.nameNe : exam.name}
              </h1>
              <Badge tone={isPublished ? "success" : "warning"}>
                {t(`status_${exam.status}`)}
              </Badge>
              <Badge tone="brand">{t(`type_${exam.type}`)}</Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{exam.academicYear.name}</span>
              <span>· {exam.gradeScale.name}</span>
              {exam.startsAt && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  <BsDate date={exam.startsAt} showAd={false} />
                  {exam.endsAt && (
                    <>
                      {" – "}
                      <BsDate date={exam.endsAt} showAd={false} />
                    </>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <>
                <Button variant="outline" onClick={openEdit}>
                  <Pencil className="size-4" />
                  {tc("edit")}
                </Button>
                {totalMarks === 0 && (
                  <Button variant="ghost" onClick={deleteExam}>
                    <Trash2 className="size-4" />
                    {tc("delete")}
                  </Button>
                )}
                <Button onClick={() => setPublishOpen(true)} disabled={totalMarks === 0}>
                  <CheckCircle2 className="size-4" />
                  {t("publish")}
                </Button>
              </>
            )}
            {isPublished && (
              <Button variant="outline" onClick={() => setUnlockOpen(true)}>
                <LockOpen className="size-4" />
                {t("unlock")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-success-bg px-4 py-3 text-sm text-success" role="status">
          {notice}
        </p>
      )}
      {isPublished && (
        <p className="flex items-center gap-2 rounded-md bg-info-bg px-4 py-3 text-sm text-info">
          <Lock className="size-4 shrink-0" />
          {t("lockedBanner")}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* Subjects */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{t("subjects")}</h2>
            {isDraft && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setAddClassId("");
                  setAddExamDate("");
                  setAddError(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t("addClassSubjects")}
              </Button>
            )}
          </div>
          {groups.length === 0 ? (
            <EmptyState icon={BookOpen} title={t("noSubjects")} description={t("noSubjectsHint")} />
          ) : (
            groups.map((g) => (
              <Card key={g.cls.publicId}>
                <CardContent className="p-0">
                  <div className="border-b border-border px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      {locale === "ne" && g.cls.nameNe ? g.cls.nameNe : g.cls.name}
                    </h3>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.subjects.map((s) => (
                      <li key={s.publicId}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedSubject(s.publicId)}
                          onKeyDown={(e) => e.key === "Enter" && setSelectedSubject(s.publicId)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
                            selectedSubject === s.publicId
                              ? "bg-brand-50/60"
                              : "hover:bg-surface-muted/60",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {locale === "ne" && s.subject.nameNe
                                ? s.subject.nameNe
                                : s.subject.name}
                              {s.subject.code && (
                                <span className="ml-1.5 text-xs text-faint">{s.subject.code}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              {t("thSummary", { full: s.fullMarksTh, pass: s.passMarksTh })}
                              {s.hasPractical &&
                                ` · ${t("prSummary", {
                                  full: s.fullMarksPr ?? 0,
                                  pass: s.passMarksPr ?? 0,
                                })}`}
                            </p>
                          </div>
                          <Badge tone={s._count.marks > 0 ? "success" : "neutral"}>
                            {t("marksCount", { count: s._count.marks })}
                          </Badge>
                          {isDraft && (
                            <>
                              <button
                                className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openConfig(s);
                                }}
                                aria-label={tc("edit")}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                className="rounded-md p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSubject(s);
                                }}
                                aria-label={tc("delete")}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Marks entry */}
        <div className="space-y-4 lg:col-span-3">
          <h2 className="text-base font-semibold text-foreground">{t("marksEntry")}</h2>
          {!selected ? (
            <EmptyState
              icon={BookOpen}
              title={t("pickSubject")}
              description={t("pickSubjectHint")}
            />
          ) : (
            <MarksEntry
              key={selected.publicId}
              examId={id}
              examSubjectId={selected.publicId}
              locked={!isDraft}
              bands={bands}
              onSaved={load}
            />
          )}
        </div>
      </div>

      {/* Results */}
      {isPublished && (
        <ResultsSection key={resultsKey} examId={id} classes={groups.map((g) => g.cls)} />
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={t("editExam")}>
        <div className="space-y-4">
          {editError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {editError}
            </p>
          )}
          <Field label={t("examName")} required>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          </Field>
          <Field label={t("examNameNe")}>
            <Input value={editNameNe} onChange={(e) => setEditNameNe(e.target.value)} />
          </Field>
          <Field label={t("type")}>
            <Select value={editType} onChange={(e) => setEditType(e.target.value as ExamType)}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`type_${x}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("startsAt")}>
              <Input
                type="date"
                value={editStartsAt}
                onChange={(e) => setEditStartsAt(e.target.value)}
              />
            </Field>
            <Field label={t("endsAt")}>
              <Input
                type="date"
                value={editEndsAt}
                onChange={(e) => setEditEndsAt(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={saveEdit} loading={editBusy} disabled={!editName.trim()}>
              {tc("save")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title={t("publish")}>
        <div className="space-y-4">
          {publishError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {publishError}
            </p>
          )}
          <p className="text-sm text-muted">{t("publishHint")}</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={publish} loading={publishBusy}>
              <CheckCircle2 className="size-4" />
              {t("publishConfirm")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Unlock dialog */}
      <Dialog open={unlockOpen} onClose={() => setUnlockOpen(false)} title={t("unlock")}>
        <div className="space-y-4">
          {unlockError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {unlockError}
            </p>
          )}
          <p className="text-sm text-muted">{t("unlockHint")}</p>
          <Field label={t("unlockReason")} required>
            <Input
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setUnlockOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={unlock}
              loading={unlockBusy}
              disabled={unlockReason.trim().length < 3}
            >
              {t("unlockConfirm")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add class subjects dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t("addClassSubjects")}>
        <div className="space-y-4">
          {addError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {addError}
            </p>
          )}
          <p className="text-sm text-muted">{t("addClassSubjectsHint")}</p>
          <Field label={t("class")} required>
            <Select value={addClassId} onChange={(e) => setAddClassId(e.target.value)}>
              <option value="">{t("class")}…</option>
              {classes.map((c) => (
                <option key={c.publicId} value={c.publicId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("examDate")}>
            <Input
              type="date"
              value={addExamDate}
              onChange={(e) => setAddExamDate(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={addClassSubjects} loading={addBusy} disabled={!addClassId}>
              {t("addSubjects")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Subject config dialog */}
      <Dialog
        open={configRow !== null}
        onClose={() => setConfigRow(null)}
        title={t("configureMarks")}
      >
        <div className="space-y-4">
          {cfgError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {cfgError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fullTh")} required>
              <Input
                inputMode="numeric"
                value={cfgFullTh}
                onChange={(e) => setCfgFullTh(e.target.value)}
              />
            </Field>
            <Field label={t("passTh")} required>
              <Input
                inputMode="numeric"
                value={cfgPassTh}
                onChange={(e) => setCfgPassTh(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={cfgPractical}
              onChange={(e) => setCfgPractical(e.target.checked)}
              className="size-4 accent-brand-600"
            />
            {t("hasPractical")}
          </label>
          {cfgPractical && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("fullPr")} required>
                <Input
                  inputMode="numeric"
                  value={cfgFullPr}
                  onChange={(e) => setCfgFullPr(e.target.value)}
                />
              </Field>
              <Field label={t("passPr")} required>
                <Input
                  inputMode="numeric"
                  value={cfgPassPr}
                  onChange={(e) => setCfgPassPr(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label={t("examDate")}>
            <Input
              type="date"
              value={cfgExamDate}
              onChange={(e) => setCfgExamDate(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setConfigRow(null)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={saveConfig}
              loading={cfgBusy}
              disabled={
                cfgFullTh.trim() === "" ||
                cfgPassTh.trim() === "" ||
                (cfgPractical && (cfgFullPr.trim() === "" || cfgPassPr.trim() === ""))
              }
            >
              {tc("save")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
