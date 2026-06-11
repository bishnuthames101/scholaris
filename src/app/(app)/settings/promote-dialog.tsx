"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import type { ClassOption } from "../students/types";

type YearRef = { publicId: string; name: string; isCurrent: boolean };

export function PromoteDialog({
  open,
  onClose,
  years,
}: {
  open: boolean;
  onClose: () => void;
  years: YearRef[];
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ promoted: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, [open]);

  // Flat list of all sections with their class labels
  const sections = useMemo(
    () =>
      classes.flatMap((c) =>
        c.sections.map((s) => ({
          publicId: s.publicId,
          label: `${c.name} · ${s.name}`,
          gradeLevel: c.gradeLevel,
        })),
      ),
    [classes],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mappings = Object.entries(mapping)
      .filter(([, to]) => to)
      .map(([from, to]) => ({ fromSectionId: from, toSectionId: to }));
    if (!fromYear || !toYear || mappings.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await api<{ promoted: number; skipped: number }>("/api/enrollments/promote", {
        method: "POST",
        body: JSON.stringify({
          fromAcademicYearId: fromYear,
          toAcademicYearId: toYear,
          mappings,
        }),
      });
      setDone(r.data);
      setMapping({});
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("promote")} className="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="text-sm text-muted">{t("promoteHint")}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fromYear")} required>
            <Select value={fromYear} onChange={(e) => setFromYear(e.target.value)} required>
              <option value="">—</option>
              {years.map((y) => (
                <option key={y.publicId} value={y.publicId} disabled={y.publicId === toYear}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("toYear")} required>
            <Select value={toYear} onChange={(e) => setToYear(e.target.value)} required>
              <option value="">—</option>
              {years.map((y) => (
                <option key={y.publicId} value={y.publicId} disabled={y.publicId === fromYear}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {sections.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{t("sectionMappings")}</p>
            <p className="text-xs text-muted">{t("sectionMappingsHint")}</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {sections.map((s) => (
                <div key={s.publicId} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.label}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted" />
                  <Select
                    value={mapping[s.publicId] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [s.publicId]: e.target.value }))
                    }
                    className="h-9 w-44 text-xs"
                    aria-label={s.label}
                  >
                    <option value="">{t("skip")}</option>
                    {sections.map((target) => (
                      <option key={target.publicId} value={target.publicId}>
                        {target.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">
            {t("promoteDone", { promoted: done.promoted, skipped: done.skipped })}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {done ? tc("back") : tc("cancel")}
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={!fromYear || !toYear || !Object.values(mapping).some(Boolean)}
          >
            {t("promote")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
