"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { formatNpr, nprToPaisa, paisaToNpr } from "@/lib/fees/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import type { ClassOption } from "../students/types";
import type { FeeFrequency, FeeHead, StructureResponse } from "./types";

const FREQUENCIES: FeeFrequency[] = ["monthly", "quarterly", "annual", "one_time"];

type Draft = { amount: string; frequency: FeeFrequency };

export function StructureTab() {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";

  const [heads, setHeads] = useState<FeeHead[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Head dialog
  const [headDialog, setHeadDialog] = useState<{ head: FeeHead | null } | null>(null);
  const [headName, setHeadName] = useState("");
  const [headNameNe, setHeadNameNe] = useState("");
  const [headSaving, setHeadSaving] = useState(false);
  const [headError, setHeadError] = useState<string | null>(null);

  // Structure editor: headPublicId → draft (empty amount = not charged)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadHeads = useCallback(() => {
    api<FeeHead[]>("/api/fees/heads")
      .then((r) => setHeads(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")));
  }, [tc]);

  useEffect(() => {
    loadHeads();
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, [loadHeads]);

  useEffect(() => {
    if (!classId) {
      setStructure(null);
      return;
    }
    let cancelled = false;
    setStructure(null);
    api<StructureResponse>(`/api/fees/structures?classId=${classId}`)
      .then((r) => {
        if (cancelled) return;
        setStructure(r.data);
        const next: Record<string, Draft> = {};
        for (const row of r.data.rows) {
          next[row.feeHead.publicId] = {
            amount: paisaToNpr(row.amountPaisa),
            frequency: row.frequency,
          };
        }
        setDrafts(next);
        setInitialDrafts(next);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [classId, tc]);

  const dirty = useMemo(() => {
    if (!heads) return false;
    return heads.some((h) => {
      const a = drafts[h.publicId];
      const b = initialDrafts[h.publicId];
      return (a?.amount ?? "") !== (b?.amount ?? "") || (a?.frequency ?? "") !== (b?.frequency ?? "");
    });
  }, [heads, drafts, initialDrafts]);

  function openHeadDialog(head: FeeHead | null) {
    setHeadName(head?.name ?? "");
    setHeadNameNe(head?.nameNe ?? "");
    setHeadError(null);
    setHeadDialog({ head });
  }

  async function saveHead() {
    if (!headName.trim()) return;
    setHeadSaving(true);
    setHeadError(null);
    try {
      const body = JSON.stringify({
        name: headName.trim(),
        nameNe: headNameNe.trim() || undefined,
        ...(headDialog?.head ? {} : { sortOrder: heads?.length ?? 0 }),
      });
      if (headDialog?.head) {
        await api(`/api/fees/heads/${headDialog.head.publicId}`, { method: "PATCH", body });
      } else {
        await api("/api/fees/heads", { method: "POST", body });
      }
      setHeadDialog(null);
      loadHeads();
    } catch (e) {
      setHeadError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setHeadSaving(false);
    }
  }

  async function deleteHead(head: FeeHead) {
    if (!window.confirm(t("deleteHeadConfirm", { name: head.name }))) return;
    try {
      await api(`/api/fees/heads/${head.publicId}`, { method: "DELETE" });
      loadHeads();
      setDrafts((d) => {
        const next = { ...d };
        delete next[head.publicId];
        return next;
      });
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    }
  }

  async function saveStructure() {
    if (!heads) return;
    const items = heads
      .filter((h) => (drafts[h.publicId]?.amount ?? "").trim() !== "")
      .map((h) => ({
        feeHeadId: h.publicId,
        amountPaisa: nprToPaisa(drafts[h.publicId].amount),
        frequency: drafts[h.publicId].frequency,
      }));
    setSaving(true);
    setError(null);
    try {
      await api("/api/fees/structures", {
        method: "PUT",
        body: JSON.stringify({ classId, items }),
      });
      setInitialDrafts({ ...drafts });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  const annualPreview = useMemo(() => {
    if (!heads) return 0;
    const multiplier: Record<FeeFrequency, number> = {
      monthly: 12,
      quarterly: 4,
      annual: 1,
      one_time: 1,
    };
    let total = 0;
    for (const h of heads) {
      const d = drafts[h.publicId];
      if (!d || d.amount.trim() === "") continue;
      try {
        total += nprToPaisa(d.amount) * multiplier[d.frequency];
      } catch {
        // ignore in-progress typing
      }
    }
    return total;
  }, [heads, drafts]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Fee heads */}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t("feeHeads")}</h2>
          <Button size="sm" variant="secondary" onClick={() => openHeadDialog(null)}>
            <Plus className="size-4" />
            {t("addHead")}
          </Button>
        </div>
        {!heads ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-6 text-brand-600" />
          </div>
        ) : heads.length === 0 ? (
          <EmptyState icon={Landmark} title={t("noHeads")} description={t("noHeadsHint")} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {heads.map((h) => (
                  <li key={h.publicId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                      {h.nameNe && <p className="truncate text-xs text-muted">{h.nameNe}</p>}
                    </div>
                    <span className="text-xs text-faint">
                      {t("usedInClasses", { count: h._count?.structures ?? 0 })}
                    </span>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                      onClick={() => openHeadDialog(h)}
                      aria-label={tc("edit")}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                      onClick={() => deleteHead(h)}
                      aria-label={tc("delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Class structure editor */}
      <div className="space-y-4 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{t("classStructure")}</h2>
          <div className="w-48">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t("class")}>
              <option value="">{t("class")}…</option>
              {classes.map((c) => (
                <option key={c.publicId} value={c.publicId}>
                  {c.name}
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

        {!classId ? (
          <EmptyState icon={Landmark} title={t("pickClass")} description={t("pickClassHint")} />
        ) : !structure ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-6 text-brand-600" />
          </div>
        ) : !structure.year ? (
          <EmptyState icon={Landmark} title={t("noCurrentYear")} />
        ) : !heads || heads.length === 0 ? (
          <EmptyState icon={Landmark} title={t("noHeads")} description={t("noHeadsHint")} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm text-muted">
                  {t("structureFor", { year: structure.year.name })}
                </span>
                <span className="text-sm text-muted">
                  {t("annualEstimate")}:{" "}
                  <span className="font-semibold text-foreground">
                    {formatNpr(annualPreview, locale)}
                  </span>
                </span>
              </div>
              <ul className="divide-y divide-border">
                {heads.map((h) => {
                  const d = drafts[h.publicId];
                  return (
                    <li key={h.publicId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                        {h.nameNe && <p className="truncate text-xs text-muted">{h.nameNe}</p>}
                      </div>
                      <div className="w-32">
                        <Input
                          inputMode="decimal"
                          placeholder={t("amountNpr")}
                          value={d?.amount ?? ""}
                          onChange={(e) =>
                            setDrafts((m) => ({
                              ...m,
                              [h.publicId]: {
                                amount: e.target.value,
                                frequency: m[h.publicId]?.frequency ?? "monthly",
                              },
                            }))
                          }
                          aria-label={`${h.name} ${t("amountNpr")}`}
                        />
                      </div>
                      <div className="w-32">
                        <Select
                          value={d?.frequency ?? "monthly"}
                          disabled={(d?.amount ?? "").trim() === ""}
                          onChange={(e) =>
                            setDrafts((m) => ({
                              ...m,
                              [h.publicId]: {
                                amount: m[h.publicId]?.amount ?? "",
                                frequency: e.target.value as FeeFrequency,
                              },
                            }))
                          }
                          aria-label={`${h.name} ${t("frequency")}`}
                        >
                          {FREQUENCIES.map((f) => (
                            <option key={f} value={f}>
                              {t(`freq_${f}`)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
                {savedFlash && !dirty && <span className="text-sm text-success">{t("saved")}</span>}
                <Button onClick={saveStructure} loading={saving} disabled={!dirty}>
                  {tc("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fee head dialog */}
      <Dialog
        open={headDialog !== null}
        onClose={() => setHeadDialog(null)}
        title={headDialog?.head ? t("editHead") : t("addHead")}
      >
        <div className="space-y-4">
          {headError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {headError}
            </p>
          )}
          <Field label={t("headName")} required>
            <Input value={headName} onChange={(e) => setHeadName(e.target.value)} autoFocus />
          </Field>
          <Field label={t("headNameNe")}>
            <Input value={headNameNe} onChange={(e) => setHeadNameNe(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setHeadDialog(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={saveHead} loading={headSaving} disabled={!headName.trim()}>
              {tc("save")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
