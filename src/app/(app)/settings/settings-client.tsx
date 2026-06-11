"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CalendarRange, Plus } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { BsDate } from "@/components/bs-date";
import { PromoteDialog } from "./promote-dialog";

type YearRow = {
  publicId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isCurrent: boolean;
};

export function SettingsClient() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [years, setYears] = useState<YearRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // form
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<YearRow[]>("/api/academic-years")
      .then((r) => {
        if (cancelled) return;
        setYears(r.data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setYears([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, tc]);

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api("/api/academic-years", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), startsAt, endsAt, makeCurrent }),
      });
      setName("");
      setStartsAt("");
      setEndsAt("");
      setAddOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function setCurrent(year: YearRow) {
    setBusyId(year.publicId);
    try {
      await api(`/api/academic-years/${year.publicId}`, {
        method: "PATCH",
        body: JSON.stringify({ makeCurrent: true }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  const loading = years === null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>

      <Card>
        <CardHeader className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("academicYears")}</CardTitle>
            <CardDescription className="mt-1">{t("academicYearsHint")}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {(years?.length ?? 0) >= 2 && (
              <Button size="sm" variant="outline" onClick={() => setPromoteOpen(true)}>
                <ArrowUpRight className="size-4" />
                {t("promote")}
              </Button>
            )}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t("addYear")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-5 text-brand-600" />
            </div>
          ) : years.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarRange className="size-8 text-muted" />
              <p className="font-medium text-foreground">{t("noYears")}</p>
              <p className="text-sm text-muted">{t("noYearsHint")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {years.map((y) => (
                <li
                  key={y.publicId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      {y.name}
                      {y.isCurrent && <Badge tone="success">{t("current")}</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      <BsDate date={new Date(y.startsAt)} /> — <BsDate date={new Date(y.endsAt)} />
                    </p>
                  </div>
                  {!y.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={busyId === y.publicId}
                      onClick={() => setCurrent(y)}
                    >
                      {t("makeCurrent")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PromoteDialog open={promoteOpen} onClose={() => setPromoteOpen(false)} years={years ?? []} />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t("addYear")}>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("yearName")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("startDate")} required>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </Field>
            <Field label={t("endDate")} required>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={makeCurrent}
              onChange={(e) => setMakeCurrent(e.target.checked)}
              className="size-4 accent-brand-600"
            />
            {t("makeCurrent")}
          </label>
          {formError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {tc("create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
