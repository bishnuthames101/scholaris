"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, BellRing, PlayCircle } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { AbsenceRun } from "./types";

const runTone = { completed: "success", held: "warning", skipped: "neutral" } as const;

/**
 * Daily absence check — shows the latest run for the selected date and lets
 * admins trigger it. A `held` run means the offline-vs-absent guard kicked in
 * (no device reported, nothing marked) and no messages were sent.
 */
export function AbsenceRunCard({ date, onRan }: { date: string; onRan?: () => void }) {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");

  const [result, setResult] = useState<{ forDate: string; run: AbsenceRun | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cutoffPrompt, setCutoffPrompt] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ date: string; run: AbsenceRun | null }>(`/api/attendance/absence-run?date=${date}`)
      .then((r) => {
        if (cancelled) return;
        setResult({ forDate: date, run: r.data.run });
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey, tc]);

  // Ignore stale responses; show a spinner until the current date's run is loaded.
  const run = result?.forDate === date ? result.run : null;
  const loading = (result === null || result.forDate !== date) && !error;

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function trigger(force: boolean) {
    setRunning(true);
    setError(null);
    setCutoffPrompt(null);
    try {
      await api("/api/attendance/absence-run", {
        method: "POST",
        body: JSON.stringify({ date, force }),
      });
      reload();
      onRan?.();
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "BEFORE_CUTOFF") {
        const cutoff =
          e.details && typeof e.details === "object"
            ? String((e.details as Record<string, unknown>).cutoff ?? "")
            : "";
        setCutoffPrompt(cutoff);
      } else {
        setError(e instanceof Error ? e.message : tc("error"));
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellRing className="size-4.5 text-brand-600" />
          <CardTitle>{t("absenceJob")}</CardTitle>
        </div>
        <CardDescription className="mt-1">{t("absenceJobHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-5 text-brand-600" />
          </div>
        ) : run ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={runTone[run.status]}>{t(`run${capitalize(run.status)}` as Parameters<typeof t>[0])}</Badge>
              <span className="text-xs text-muted">
                {new Date(run.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {run.status === "held" && (
              <div className="flex items-start gap-2.5 rounded-md bg-warning-bg px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{t("heldExplain")}</p>
              </div>
            )}

            {run.status === "completed" && (
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["presentCount", run.presentCount],
                    ["absentCount", run.absentCount],
                    ["messagesQueued", run.eventsEmitted],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-surface-muted px-2 py-2.5">
                    <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
                    <dt className="text-xs text-muted">{t(key)}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("noRunYet")}</p>
        )}

        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {cutoffPrompt !== null ? (
          <div className="space-y-2 rounded-md bg-warning-bg px-3 py-2.5">
            <p className="text-sm text-warning">{t("beforeCutoff", { cutoff: cutoffPrompt })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCutoffPrompt(null)}>
                {tc("cancel")}
              </Button>
              <Button size="sm" onClick={() => trigger(true)} loading={running}>
                {t("runAnyway")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant={run ? "outline" : "primary"}
            className="w-full"
            onClick={() => trigger(false)}
            loading={running}
          >
            <PlayCircle className="size-4" />
            {run ? t("runAgain") : t("runNow")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
