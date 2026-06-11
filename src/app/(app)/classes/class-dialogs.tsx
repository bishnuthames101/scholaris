"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import type { ClassOption } from "../students/types";

export type SubjectRow = {
  publicId: string;
  name: string;
  nameNe?: string | null;
  code?: string | null;
  hasPractical: boolean;
  fullMarksTh?: number | null;
  passMarksTh?: number | null;
  fullMarksPr?: number | null;
  passMarksPr?: number | null;
};

const STREAMS = ["science", "management", "humanities", "education"] as const;

function gradeOptions(t: ReturnType<typeof useTranslations<"classes">>) {
  const opts: { value: number; label: string }[] = [
    { value: -1, label: t("gradeEcd") },
    { value: 0, label: t("gradeKg") },
  ];
  for (let g = 1; g <= 12; g++) opts.push({ value: g, label: String(g) });
  return opts;
}

export function AddClassDialog({
  open,
  onClose,
  existing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existing: ClassOption[];
  onCreated: () => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [gradeLevel, setGradeLevel] = useState("1");
  const [stream, setStream] = useState("");
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grade = Number(gradeLevel);
  const allowStream = grade === 11 || grade === 12;

  function defaultName(g: number, s: string): string {
    const base = g === -1 ? "ECD" : g === 0 ? "KG" : `Class ${g}`;
    return s ? `${base} (${s.charAt(0).toUpperCase()}${s.slice(1)})` : base;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/classes", {
        method: "POST",
        body: JSON.stringify({
          gradeLevel: grade,
          stream: allowStream && stream ? stream : undefined,
          name: name.trim() || defaultName(grade, allowStream ? stream : ""),
          nameNe: nameNe.trim() || undefined,
        }),
      });
      setName("");
      setNameNe("");
      setStream("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("addClass")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("grade")} required>
            <Select
              value={gradeLevel}
              onChange={(e) => {
                setGradeLevel(e.target.value);
                setStream("");
              }}
            >
              {gradeOptions(t).map((o) => (
                <option
                  key={o.value}
                  value={o.value}
                  disabled={
                    !((o.value === 11 || o.value === 12)) &&
                    existing.some((c) => c.gradeLevel === o.value)
                  }
                >
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("stream")}>
            <Select
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              disabled={!allowStream}
            >
              <option value="">{t("noStream")}</option>
              {STREAMS.map((s) => (
                <option key={s} value={s}>
                  {t(`stream${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("title")} hint={defaultName(grade, allowStream ? stream : "")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName(grade, allowStream ? stream : "")}
          />
        </Field>
        <Field label={`${t("title")} (नेपाली)`}>
          <Input value={nameNe} onChange={(e) => setNameNe(e.target.value)} lang="ne" />
        </Field>
        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {tc("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddSectionDialog({
  cls,
  onClose,
  onCreated,
}: {
  cls: ClassOption | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [name, setName] = useState("A");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cls) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/classes/${cls.publicId}/sections`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("A");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(cls)}
      onClose={onClose}
      title={cls ? `${t("addSection")} — ${cls.name}` : t("addSection")}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("sectionName")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {tc("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddSubjectDialog({
  cls,
  onClose,
  onCreated,
}: {
  cls: ClassOption | null;
  onClose: () => void;
  onCreated: (classId: string) => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [code, setCode] = useState("");
  const [hasPractical, setHasPractical] = useState(false);
  const [fullTh, setFullTh] = useState("100");
  const [passTh, setPassTh] = useState("40");
  const [fullPr, setFullPr] = useState("25");
  const [passPr, setPassPr] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cls) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/classes/${cls.publicId}/subjects`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          nameNe: nameNe.trim() || undefined,
          code: code.trim() || undefined,
          hasPractical,
          fullMarksTh: fullTh ? Number(fullTh) : undefined,
          passMarksTh: passTh ? Number(passTh) : undefined,
          fullMarksPr: hasPractical && fullPr ? Number(fullPr) : undefined,
          passMarksPr: hasPractical && passPr ? Number(passPr) : undefined,
        }),
      });
      setName("");
      setNameNe("");
      setCode("");
      setHasPractical(false);
      onCreated(cls.publicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(cls)}
      onClose={onClose}
      title={cls ? `${t("addSubject")} — ${cls.name}` : t("addSubject")}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("subjectName")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t("subjectCode")}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label={`${t("subjectName")} (नेपाली)`} className="sm:col-span-2">
            <Input value={nameNe} onChange={(e) => setNameNe(e.target.value)} lang="ne" />
          </Field>
        </div>

        <div className="grid gap-4 rounded-md bg-surface-muted/50 p-4 sm:grid-cols-2">
          <Field label={`${t("fullMarks")} (${t("theory")})`}>
            <Input type="number" min={0} value={fullTh} onChange={(e) => setFullTh(e.target.value)} />
          </Field>
          <Field label={`${t("passMarks")} (${t("theory")})`}>
            <Input type="number" min={0} value={passTh} onChange={(e) => setPassTh(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={hasPractical}
              onChange={(e) => setHasPractical(e.target.checked)}
              className="size-4 accent-brand-600"
            />
            {t("hasPractical")}
          </label>
          {hasPractical && (
            <>
              <Field label={`${t("fullMarks")} (${t("practical")})`}>
                <Input type="number" min={0} value={fullPr} onChange={(e) => setFullPr(e.target.value)} />
              </Field>
              <Field label={`${t("passMarks")} (${t("practical")})`}>
                <Input type="number" min={0} value={passPr} onChange={(e) => setPassPr(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {tc("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
