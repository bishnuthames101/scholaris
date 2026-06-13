"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Homework = {
  publicId: string;
  title: string;
  titleNe: string | null;
  description: string | null;
  dueDate: string;
  publishedAt: string | null;
  section: { publicId: string; name: string; class: { publicId: string; name: string } };
  subject: { publicId: string; name: string; nameNe: string | null };
  staff: { publicId: string; name: string };
  _count: { submissions: number };
};

type Section = { publicId: string; name: string; class: { publicId: string; name: string } };
type Subject = { publicId: string; name: string; nameNe: string | null };

export default function HomeworkPage() {
  const t = useTranslations("homework");
  const tc = useTranslations("common");
  const [items, setItems] = useState<Homework[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, unknown[]>>({});

  // Create form
  const [form, setForm] = useState({
    sectionId: "", subjectId: "", title: "", titleNe: "", description: "", dueDate: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Section[]>("/api/sections?pageSize=100").then((r) => {
      setSections(r.data);
      if (r.data.length > 0) setForm((f) => ({ ...f, sectionId: r.data[0].publicId }));
    }).catch(() => {});
    api<Subject[]>("/api/subjects?pageSize=100").then((r) => {
      setSubjects(r.data);
      if (r.data.length > 0) setForm((f) => ({ ...f, subjectId: r.data[0].publicId }));
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api<Homework[]>(`/api/homework?page=${page}&pageSize=20`)
      .then((r) => { setItems(r.data); setTotal(r.meta?.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, refreshKey]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/homework", {
        method: "POST",
        body: JSON.stringify({
          sectionId: form.sectionId,
          subjectId: form.subjectId,
          title: form.title,
          titleNe: form.titleNe || undefined,
          description: form.description || undefined,
          dueDate: form.dueDate,
          publishNow: true,
        }),
      });
      setShowCreate(false);
      setForm((f) => ({ ...f, title: "", titleNe: "", description: "", dueDate: "" }));
      setRefreshKey((k) => k + 1);
    } catch { /* handled */ } finally { setSaving(false); }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!submissions[id]) {
      const r = await api<unknown[]>(`/api/homework/${id}/submissions`);
      setSubmissions((s) => ({ ...s, [id]: r.data }));
    }
  }

  const totalPages = Math.ceil(total / 20);

  function dueStatus(d: string): string {
    const due = new Date(d);
    const now = new Date();
    if (due < now) return "text-red-600";
    const diff = (due.getTime() - now.getTime()) / 86400000;
    if (diff <= 2) return "text-amber-600";
    return "text-green-600";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? tc("cancel") : t("assignHomework")}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-surface p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("section")}</label>
              <select value={form.sectionId} onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm">
                {sections.map((s) => <option key={s.publicId} value={s.publicId}>{s.class.name} — {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("subject")}</label>
              <select value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm">
                {subjects.map((s) => <option key={s.publicId} value={s.publicId}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("dueDate")}</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("hwTitle")}</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("hwDescription")}</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? "..." : t("assign")}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noHomework")}</p>
          <p className="mt-1 text-xs text-muted">{t("noHomeworkHint")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((hw) => (
              <div key={hw.publicId} className="rounded-lg border border-border bg-surface shadow-sm">
                <button onClick={() => toggleExpand(hw.publicId)} className="w-full p-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{hw.title}</h3>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        <span>{hw.section.class.name} {hw.section.name}</span>
                        <span>·</span>
                        <span>{hw.subject.name}</span>
                        <span>·</span>
                        <span>{hw.staff.name}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-medium ${dueStatus(hw.dueDate)}`}>
                        {t("due")}: {new Date(hw.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </div>
                      <div className="text-xs text-muted">{hw._count.submissions} {t("submissions")}</div>
                    </div>
                  </div>
                </button>

                {expanded === hw.publicId && (
                  <div className="border-t border-border p-4">
                    {hw.description && <p className="mb-3 text-sm text-foreground whitespace-pre-wrap">{hw.description}</p>}
                    <h4 className="text-sm font-medium text-foreground mb-2">{t("submissions")}</h4>
                    {(submissions[hw.publicId] as { publicId: string; student: { name: string; admissionNo: string }; submittedAt: string; grade: string | null; comment: string | null }[] | undefined)?.length === 0 ? (
                      <p className="text-xs text-muted">{t("noSubmissions")}</p>
                    ) : (
                      <div className="space-y-2">
                        {(submissions[hw.publicId] as { publicId: string; student: { name: string; admissionNo: string }; submittedAt: string; grade: string | null; comment: string | null }[] | undefined)?.map((sub) => (
                          <div key={sub.publicId} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                            <div>
                              <span className="font-medium text-foreground">{sub.student.name}</span>
                              <span className="ml-2 text-xs text-muted">{sub.student.admissionNo}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {sub.grade && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">{sub.grade}</span>}
                              <span className="text-xs text-muted">{new Date(sub.submittedAt).toLocaleDateString("en-GB")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} {t("title").toLowerCase()}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded border border-border px-3 py-1 disabled:opacity-30">{tc("previous")}</button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded border border-border px-3 py-1 disabled:opacity-30">{tc("next")}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
