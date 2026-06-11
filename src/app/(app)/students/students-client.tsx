"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Search, Upload, Users } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { AddStudentDialog } from "./add-student-dialog";
import { ImportDialog } from "./import-dialog";
import type { ClassOption, StudentRow } from "./types";

const PAGE_SIZE = 20;

const statusTone = {
  active: "success",
  transferred: "info",
  graduated: "brand",
  dropped: "danger",
} as const;

export function StudentsClient() {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) params.set("search", debounced);
    if (sectionId) params.set("sectionId", sectionId);
    else if (classId) params.set("classId", classId);
    api<StudentRow[]>(`/api/students?${params}`)
      .then((r) => {
        if (cancelled) return;
        setStudents(r.data);
        setTotal(r.meta?.total ?? r.data.length);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setStudents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debounced, classId, sectionId, refreshKey, tc]);

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.publicId === classId),
    [classes, classId],
  );

  const hasFilters = Boolean(debounced || classId || sectionId);
  const loading = students === null;
  const empty = !loading && students.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            {t("importCsv")}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
            aria-label={tc("search")}
          />
        </div>
        <div className="w-44">
          <Select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
              setPage(1);
            }}
            aria-label={t("class")}
          >
            <option value="">{t("allClasses")}</option>
            {classes.map((c) => (
              <option key={c.publicId} value={c.publicId}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setPage(1);
            }}
            disabled={!selectedClass}
            aria-label={t("section")}
          >
            <option value="">{t("allSections")}</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.publicId} value={s.publicId}>
                {s.name}
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

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : empty ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? t("noMatches") : t("emptyTitle")}
          description={hasFilters ? undefined : t("emptyHint")}
          action={
            hasFilters ? undefined : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="size-4" />
                  {t("importCsv")}
                </Button>
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  {t("add")}
                </Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("name")}</TH>
                <TH>{t("admissionNo")}</TH>
                <TH>{t("class")}</TH>
                <TH className="text-right">{t("rollNo")}</TH>
                <TH>{t("status")}</TH>
              </tr>
            </THead>
            <TBody>
              {students.map((s) => (
                <TR
                  key={s.publicId}
                  interactive
                  onClick={() => router.push(`/students/${s.publicId}`)}
                >
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} src={s.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        {s.nameNe && <p className="truncate text-xs text-muted">{s.nameNe}</p>}
                      </div>
                    </div>
                  </TD>
                  <TD className="font-mono text-xs">{s.admissionNo}</TD>
                  <TD>
                    {s.currentEnrollment ? (
                      <span>
                        {s.currentEnrollment.section.class.name}
                        <span className="text-muted"> · {s.currentEnrollment.section.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{t("noSection")}</span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {s.currentEnrollment?.rollNo ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={statusTone[s.status]}>
                      {t(
                        `status${s.status.charAt(0).toUpperCase()}${s.status.slice(1)}` as Parameters<typeof t>[0],
                      )}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <AddStudentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        classes={classes}
        onCreated={() => {
          setAddOpen(false);
          load();
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={load}
      />
    </div>
  );
}
