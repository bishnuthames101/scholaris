"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Scale, Star, Trash2, X } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { NEB_DEFAULT_SCALE } from "@/lib/exams/grading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { GradeScaleRow } from "./types";

type BandDraft = {
  letter: string;
  letterNe: string;
  gradePoint: string;
  minPercent: string;
  maxPercent: string;
  isPassing: boolean;
};

function nebDefaultDrafts(): BandDraft[] {
  return NEB_DEFAULT_SCALE.bands.map((b) => ({
    letter: b.letter,
    letterNe: "",
    gradePoint: String(b.gradePoint),
    minPercent: String(b.minPercent),
    maxPercent: String(b.maxPercent),
    isPassing: b.isPassing,
  }));
}

export function ScalesTab() {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";

  const [scales, setScales] = useState<GradeScaleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create/edit dialog
  const [dialog, setDialog] = useState<{ scale: GradeScaleRow | null } | null>(null);
  const [scaleName, setScaleName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<GradeScaleRow[]>("/api/exams/grade-scales")
      .then((r) => {
        setScales(r.data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")));
  }, [tc]);

  useEffect(() => {
    load();
  }, [load]);

  function openDialog(scale: GradeScaleRow | null) {
    setScaleName(scale?.name ?? "");
    setIsDefault(scale?.isDefault ?? false);
    setBands(
      scale
        ? scale.bands.map((b) => ({
            letter: b.letter,
            letterNe: b.letterNe ?? "",
            gradePoint: String(Number(b.gradePoint)),
            minPercent: String(Number(b.minPercent)),
            maxPercent: String(Number(b.maxPercent)),
            isPassing: b.isPassing,
          }))
        : nebDefaultDrafts(),
    );
    setDialogError(null);
    setDialog({ scale });
  }

  function updateBand(index: number, patch: Partial<BandDraft>) {
    setBands((list) => list.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function addBand() {
    setBands((list) => [
      ...list,
      { letter: "", letterNe: "", gradePoint: "", minPercent: "", maxPercent: "", isPassing: true },
    ]);
  }

  function removeBand(index: number) {
    setBands((list) => list.filter((_, i) => i !== index));
  }

  async function saveScale() {
    if (!scaleName.trim()) return;
    setSaving(true);
    setDialogError(null);
    try {
      const body = JSON.stringify({
        name: scaleName.trim(),
        isDefault,
        bands: bands.map((b) => ({
          letter: b.letter.trim(),
          ...(b.letterNe.trim() ? { letterNe: b.letterNe.trim() } : {}),
          gradePoint: Number(b.gradePoint),
          minPercent: Number(b.minPercent),
          maxPercent: Number(b.maxPercent),
          isPassing: b.isPassing,
        })),
      });
      if (dialog?.scale) {
        await api(`/api/exams/grade-scales/${dialog.scale.publicId}`, { method: "PUT", body });
      } else {
        await api("/api/exams/grade-scales", { method: "POST", body });
      }
      setDialog(null);
      load();
    } catch (e) {
      setDialogError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteScale(scale: GradeScaleRow) {
    if (!window.confirm(t("deleteScaleConfirm", { name: scale.name }))) return;
    try {
      await api(`/api/exams/grade-scales/${scale.publicId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    }
  }

  const bandsValid =
    bands.length >= 2 &&
    bands.every(
      (b) =>
        b.letter.trim() !== "" &&
        b.gradePoint.trim() !== "" &&
        b.minPercent.trim() !== "" &&
        b.maxPercent.trim() !== "" &&
        !Number.isNaN(Number(b.gradePoint)) &&
        !Number.isNaN(Number(b.minPercent)) &&
        !Number.isNaN(Number(b.maxPercent)),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t("scalesHint")}</p>
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" />
          {t("addScale")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!scales ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : scales.length === 0 ? (
        <EmptyState icon={Scale} title={t("noScales")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {scales.map((scale) => (
            <Card key={scale.publicId}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {scale.name}
                    {scale.isDefault && (
                      <Badge tone="brand">
                        <Star className="mr-1 size-3 fill-current" />
                        {t("defaultScale")}
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("usedInExams", { count: scale._count?.exams ?? 0 })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                    onClick={() => openDialog(scale)}
                    aria-label={tc("edit")}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    className="rounded-md p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                    onClick={() => deleteScale(scale)}
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("letter")}</TH>
                      <TH className="text-right">{t("gradePoint")}</TH>
                      <TH className="text-right">{t("range")}</TH>
                      <TH>{t("passing")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {scale.bands.map((b) => (
                      <TR key={b.letter}>
                        <TD className="font-medium">
                          {locale === "ne" && b.letterNe ? b.letterNe : b.letter}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {Number(b.gradePoint).toFixed(1)}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {Number(b.minPercent)}–{Number(b.maxPercent)}%
                        </TD>
                        <TD>
                          {b.isPassing ? (
                            <Badge tone="success">{t("passing")}</Badge>
                          ) : (
                            <Badge tone="danger">{t("failing")}</Badge>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/edit dialog */}
      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.scale ? t("editScale") : t("addScale")}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {dialogError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {dialogError}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t("scaleName")} required className="min-w-56 flex-1">
              <Input value={scaleName} onChange={(e) => setScaleName(e.target.value)} autoFocus />
            </Field>
            <label className="flex h-10 items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 accent-brand-600"
              />
              {t("makeDefault")}
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("bands")}</h3>
              <Button size="sm" variant="secondary" onClick={addBand}>
                <Plus className="size-4" />
                {t("addBand")}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("letter")}
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("letterNe")}
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("gradePoint")}
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("minPercent")}
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("maxPercent")}
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("passing")}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bands.map((b, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-16 px-2"
                          value={b.letter}
                          onChange={(e) => updateBand(i, { letter: e.target.value })}
                          aria-label={t("letter")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-16 px-2"
                          value={b.letterNe}
                          onChange={(e) => updateBand(i, { letterNe: e.target.value })}
                          aria-label={t("letterNe")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-20 px-2 text-right"
                          inputMode="decimal"
                          value={b.gradePoint}
                          onChange={(e) => updateBand(i, { gradePoint: e.target.value })}
                          aria-label={t("gradePoint")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-20 px-2 text-right"
                          inputMode="decimal"
                          value={b.minPercent}
                          onChange={(e) => updateBand(i, { minPercent: e.target.value })}
                          aria-label={t("minPercent")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-20 px-2 text-right"
                          inputMode="decimal"
                          value={b.maxPercent}
                          onChange={(e) => updateBand(i, { maxPercent: e.target.value })}
                          aria-label={t("maxPercent")}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={b.isPassing}
                          onChange={(e) => updateBand(i, { isPassing: e.target.checked })}
                          className="size-4 accent-brand-600"
                          aria-label={t("passing")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          className="rounded-md p-1 text-muted hover:bg-danger-bg hover:text-danger"
                          onClick={() => removeBand(i)}
                          aria-label={tc("delete")}
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t("bandsHint")}</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={saveScale} loading={saving} disabled={!scaleName.trim() || !bandsValid}>
              {tc("save")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
