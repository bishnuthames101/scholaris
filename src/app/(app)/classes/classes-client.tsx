"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Layers, Plus, Users } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import type { ClassOption } from "../students/types";
import { AddClassDialog, AddSectionDialog, AddSubjectDialog, type SubjectRow } from "./class-dialogs";

export function ClassesClient() {
  const t = useTranslations("classes");
  const tc = useTranslations("common");

  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [sectionFor, setSectionFor] = useState<ClassOption | null>(null);
  const [subjectFor, setSubjectFor] = useState<ClassOption | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, SubjectRow[] | "loading">>(
    {},
  );
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<ClassOption[]>("/api/classes")
      .then((r) => {
        if (cancelled) return;
        setClasses(r.data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, tc]);

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function toggleSubjects(cls: ClassOption) {
    if (expandedSubjects[cls.publicId]) {
      setExpandedSubjects((m) => {
        const next = { ...m };
        delete next[cls.publicId];
        return next;
      });
      return;
    }
    setExpandedSubjects((m) => ({ ...m, [cls.publicId]: "loading" }));
    try {
      const r = await api<SubjectRow[]>(`/api/classes/${cls.publicId}/subjects`);
      setExpandedSubjects((m) => ({ ...m, [cls.publicId]: r.data }));
    } catch {
      setExpandedSubjects((m) => {
        const next = { ...m };
        delete next[cls.publicId];
        return next;
      });
    }
  }

  const loading = classes === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setAddClassOpen(true)}>
          <Plus className="size-4" />
          {t("addClass")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("noClasses")}
          description={t("noClassesHint")}
          action={
            <Button onClick={() => setAddClassOpen(true)}>
              <Plus className="size-4" />
              {t("addClass")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => {
            const subjects = expandedSubjects[cls.publicId];
            return (
              <Card key={cls.publicId} className="flex flex-col">
                <CardHeader className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {cls.name}
                      {cls.stream && (
                        <Badge tone="info">
                          {t(
                            `stream${cls.stream.charAt(0).toUpperCase()}${cls.stream.slice(1)}` as Parameters<typeof t>[0],
                          )}
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted">
                      {t("subjectsCount", { count: cls._count?.subjects ?? 0 })}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("sections")}
                    </p>
                    {cls.sections.length === 0 ? (
                      <p className="text-sm text-muted">{t("noSections")}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {cls.sections.map((s) => (
                          <li
                            key={s.publicId}
                            className="flex items-center justify-between rounded-md bg-surface-muted/60 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-foreground">{s.name}</span>
                            <span className="flex items-center gap-3 text-xs text-muted">
                              {s.classTeacher && <span>{s.classTeacher.name}</span>}
                              <span className="flex items-center gap-1">
                                <Users className="size-3.5" />
                                {s._count?.enrollments ?? 0}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {Array.isArray(subjects) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("subjects")}
                      </p>
                      {subjects.length === 0 ? (
                        <p className="text-sm text-muted">{t("noSubjects")}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {subjects.map((sub) => (
                            <li
                              key={sub.publicId}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-foreground">
                                {sub.name}
                                {sub.code && (
                                  <span className="ml-1.5 font-mono text-xs text-muted">
                                    {sub.code}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted">
                                {sub.fullMarksTh ?? "—"}
                                {sub.hasPractical && sub.fullMarksPr != null && ` + ${sub.fullMarksPr}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setSectionFor(cls)}>
                      <Plus className="size-3.5" />
                      {t("addSection")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSubjectFor(cls)}>
                      <Plus className="size-3.5" />
                      {t("addSubject")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSubjects(cls)}
                      loading={subjects === "loading"}
                    >
                      <BookOpen className="size-3.5" />
                      {t("subjects")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddClassDialog
        open={addClassOpen}
        onClose={() => setAddClassOpen(false)}
        existing={classes ?? []}
        onCreated={() => {
          setAddClassOpen(false);
          load();
        }}
      />
      <AddSectionDialog
        cls={sectionFor}
        onClose={() => setSectionFor(null)}
        onCreated={() => {
          setSectionFor(null);
          load();
        }}
      />
      <AddSubjectDialog
        cls={subjectFor}
        onClose={() => setSubjectFor(null)}
        onCreated={(classId) => {
          setSubjectFor(null);
          setExpandedSubjects((m) => {
            const next = { ...m };
            delete next[classId];
            return next;
          });
          load();
        }}
      />
    </div>
  );
}
