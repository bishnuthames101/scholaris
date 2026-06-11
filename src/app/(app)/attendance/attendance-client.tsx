"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, CheckCheck, Nfc } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { BsDate } from "@/components/bs-date";
import { cn } from "@/lib/cn";
import { AbsenceRunCard } from "./absence-run-card";
import type { AttendanceStatus, RosterResponse } from "./types";
import type { ClassOption } from "../students/types";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "leave"];

const statusStyles: Record<AttendanceStatus, { active: string; dot: string }> = {
  present: { active: "bg-success-bg text-success ring-1 ring-inset ring-success/30", dot: "bg-success" },
  absent: { active: "bg-danger-bg text-danger ring-1 ring-inset ring-danger/30", dot: "bg-danger" },
  late: { active: "bg-warning-bg text-warning ring-1 ring-inset ring-warning/30", dot: "bg-warning" },
  leave: { active: "bg-info-bg text-info ring-1 ring-inset ring-info/30", dot: "bg-info" },
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AttendanceClient() {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(localToday());

  const [fetched, setFetched] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // studentPublicId → status (current edits); initial = saved state for diffing
  const [marks, setMarks] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [initial, setInitial] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sectionId || !date) return;
    let cancelled = false;
    api<RosterResponse>(`/api/attendance?sectionId=${sectionId}&date=${date}`)
      .then((r) => {
        if (cancelled) return;
        setFetched(r.data);
        const saved: Record<string, AttendanceStatus | undefined> = {};
        for (const item of r.data.roster) saved[item.student.publicId] = item.record?.status;
        setMarks(saved);
        setInitial(saved);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, date, refreshKey, tc]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.publicId === classId),
    [classes, classId],
  );

  // Only show data matching the current selection (stale responses are ignored).
  const data =
    fetched && fetched.section.publicId === sectionId && fetched.date === date ? fetched : null;
  const loading = Boolean(sectionId && date) && !data && !error;

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
    if (!data) return c;
    for (const item of data.roster) {
      const s = marks[item.student.publicId];
      if (s) c[s] += 1;
      else c.unmarked += 1;
    }
    return c;
  }, [data, marks]);

  const dirty = useMemo(
    () =>
      data?.roster.some((item) => {
        const id = item.student.publicId;
        return marks[id] !== undefined && marks[id] !== initial[id];
      }) ?? false,
    [data, marks, initial],
  );

  function markAllPresent() {
    if (!data) return;
    setMarks((m) => {
      const next = { ...m };
      for (const item of data.roster) next[item.student.publicId] ??= "present";
      return next;
    });
  }

  async function onSave() {
    if (!data) return;
    const entries = data.roster
      .map((item) => item.student.publicId)
      .filter((id) => marks[id] !== undefined && marks[id] !== initial[id])
      .map((id) => ({ studentId: id, status: marks[id] as AttendanceStatus }));
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ sectionId, date, entries }),
      });
      setInitial({ ...marks });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      if (e instanceof ClientApiError) setError(e.message);
      else setError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSectionId("");
                }}
                aria-label={t("class")}
              >
                <option value="">{t("class")}…</option>
                {classes.map((c) => (
                  <option key={c.publicId} value={c.publicId}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={!selectedClass}
                aria-label={t("section")}
              >
                <option value="">{t("section")}…</option>
                {selectedClass?.sections.map((s) => (
                  <option key={s.publicId} value={s.publicId}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Input
                type="date"
                value={date}
                max={localToday()}
                onChange={(e) => setDate(e.target.value)}
                aria-label={t("date")}
              />
            </div>
            <div className="flex h-10 items-center text-sm text-muted">
              <BsDate date={new Date(`${date}T00:00:00`)} />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {!sectionId ? (
            <EmptyState icon={CalendarCheck} title={t("pickSection")} description={t("pickSectionHint")} />
          ) : loading ? (
            <div className="flex justify-center py-20">
              <Spinner className="size-6 text-brand-600" />
            </div>
          ) : !data ? null : data.roster.length === 0 ? (
            <EmptyState icon={CalendarCheck} title={t("emptyRoster")} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {data.section.className} · {data.section.name}
                    </span>
                    <span className="text-muted">— {data.roster.length}</span>
                    {(["present", "absent", "late", "leave"] as const).map((s) =>
                      counts[s] > 0 ? (
                        <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <span className={cn("size-1.5 rounded-full", statusStyles[s].dot)} />
                          {counts[s]} {t(s)}
                        </span>
                      ) : null,
                    )}
                    {counts.unmarked > 0 && (
                      <span className="text-xs text-faint">
                        {counts.unmarked} {t("unmarked")}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="secondary" onClick={markAllPresent}>
                    <CheckCheck className="size-4" />
                    {t("markAllPresent")}
                  </Button>
                </div>

                <ul className="divide-y divide-border">
                  {data.roster.map((item) => {
                    const id = item.student.publicId;
                    const status = marks[id];
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className="w-7 text-right font-mono text-xs tabular-nums text-faint">
                          {item.student.rollNo ?? "—"}
                        </span>
                        <Avatar name={item.student.name} src={item.student.photoUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.student.name}
                          </p>
                          {item.record?.source === "rfid" && item.record.firstTapAt && (
                            <p className="flex items-center gap-1 text-xs text-muted">
                              <Nfc className="size-3 text-brand-600" />
                              {new Date(item.record.firstTapAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {item.record.lastTapAt &&
                                item.record.lastTapAt !== item.record.firstTapAt && (
                                  <>
                                    {" – "}
                                    {new Date(item.record.lastTapAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </>
                                )}
                            </p>
                          )}
                        </div>
                        {item.record?.source === "rfid" && (
                          <Badge tone="brand" className="hidden sm:inline-flex">
                            RFID
                          </Badge>
                        )}
                        {item.record?.source === "system" && (
                          <Badge tone="neutral" className="hidden sm:inline-flex">
                            {t("sourceSystem")}
                          </Badge>
                        )}
                        <div
                          role="radiogroup"
                          aria-label={item.student.name}
                          className="flex rounded-md bg-surface-muted p-0.5"
                        >
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={status === s}
                              onClick={() => setMarks((m) => ({ ...m, [id]: s }))}
                              className={cn(
                                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                                status === s
                                  ? statusStyles[s].active
                                  : "text-muted hover:text-foreground",
                              )}
                            >
                              {t(`${s}Short` as Parameters<typeof t>[0])}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <AbsenceRunCard date={date} onRan={reload} />
        </div>
      </div>

      {/* Sticky save bar */}
      {(dirty || savedFlash) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 px-4 py-3 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <p className="text-sm text-muted">
              {savedFlash && !dirty ? t("saved") : t("unsavedChanges")}
            </p>
            <Button onClick={onSave} loading={saving} disabled={!dirty}>
              {tc("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
