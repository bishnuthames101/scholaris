"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Enquiry = {
  publicId: string;
  studentName: string;
  studentNameNe: string | null;
  guardianName: string;
  guardianPhone: string;
  source: string;
  status: string;
  createdAt: string;
  applyingForClass: { publicId: string; name: string } | null;
  _count: { followUps: number };
};

type Tab = "enquiries" | "applications";

const ENQUIRY_STATUSES = ["new_enquiry", "contacted", "visit_scheduled", "visited", "application_sent", "converted", "lost"];
const SOURCES = ["walk_in", "phone", "website", "referral", "social_media", "other"];

export default function AdmissionsPage() {
  const t = useTranslations("admissions");
  const [tab, setTab] = useState<Tab>("enquiries");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {(["enquiries", "applications"] as Tab[]).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2
                ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t2 === "enquiries" ? t("tabEnquiries") : t("tabApplications")}
          </button>
        ))}
      </div>

      {tab === "enquiries" && <EnquiriesTab onError={setError} />}
      {tab === "applications" && <ApplicationsTab onError={setError} />}
    </div>
  );
}

function EnquiriesTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("admissions");
  const tc = useTranslations("common");
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({
    studentName: "", guardianName: "", guardianPhone: "", guardianEmail: "",
    source: "walk_in", note: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    api<Enquiry[]>(`/api/admissions/enquiries?${params}`)
      .then((r) => { setEnquiries(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, statusFilter, search, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admissions/enquiries", {
        method: "POST",
        body: JSON.stringify({
          studentName: form.studentName,
          guardianName: form.guardianName,
          guardianPhone: form.guardianPhone,
          guardianEmail: form.guardianEmail || undefined,
          source: form.source,
          note: form.note || undefined,
        }),
      });
      setShowAdd(false);
      setForm({ studentName: "", guardianName: "", guardianPhone: "", guardianEmail: "", source: "walk_in", note: "" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, status: string) {
    try {
      await api(`/api/admissions/enquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/api/admissions/enquiries/${id}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);

  const statusBadge: Record<string, string> = {
    new_enquiry: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    contacted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    visit_scheduled: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    visited: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    application_sent: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
    converted: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    lost: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={`${t("studentName")} / ${t("guardianName")}…`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-9 w-60 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t("status")}…</option>
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status_${s}`)}</option>
          ))}
        </select>
        <div className="ml-auto">
          <button onClick={() => setShowAdd(!showAdd)} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {t("addEnquiry")}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input required placeholder={t("studentName")} value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input required placeholder={t("guardianName")} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input required placeholder={t("guardianPhone")} value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("guardianEmail")} value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {SOURCES.map((s) => (
              <option key={s} value={s}>{t(`source_${s}`)}</option>
            ))}
          </select>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? tc("saving") : tc("save")}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">{tc("cancel")}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : enquiries.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noEnquiries")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("studentName")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("guardianName")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("guardianPhone")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("source")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enquiries.map((enq) => (
                <tr key={enq.publicId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{enq.studentName}</td>
                  <td className="px-4 py-3">{enq.guardianName}</td>
                  <td className="px-4 py-3">{enq.guardianPhone}</td>
                  <td className="px-4 py-3 text-xs">{t(`source_${enq.source}`)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={enq.status}
                      onChange={(e) => handleUpdateStatus(enq.publicId, e.target.value)}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs ${statusBadge[enq.status] ?? ""}`}
                    >
                      {ENQUIRY_STATUSES.map((s) => (
                        <option key={s} value={s}>{t(`status_${s}`)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(enq.publicId)} className="text-xs text-red-600 hover:underline">{tc("delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages} ({total} {tc("total")})</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationsTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("admissions");
  const tc = useTranslations("common");
  const [apps, setApps] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);
    api<Record<string, unknown>[]>(`/api/admissions/applications?${params}`)
      .then((r) => { setApps(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, statusFilter, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    try {
      await api(`/api/admissions/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);
  const appStatuses = ["submitted", "under_review", "app_approved", "app_rejected", "enrolled", "withdrawn"];

  const statusBadge: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-blue-100 text-blue-700",
    under_review: "bg-yellow-100 text-yellow-700",
    app_approved: "bg-green-100 text-green-700",
    app_rejected: "bg-red-100 text-red-700",
    enrolled: "bg-emerald-100 text-emerald-700",
    withdrawn: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t("status")}…</option>
          {appStatuses.map((s) => (
            <option key={s} value={s}>{s.replace("app_", "").replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : apps.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">No applications</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">App #</th>
                <th className="px-4 py-3 text-left font-medium">{t("studentName")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("guardianName")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("applyingFor")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apps.map((a) => {
                const cls = a.applyingForClass as { name: string } | null;
                const status = a.status as string;
                const canReview = ["submitted", "under_review"].includes(status);
                return (
                  <tr key={a.publicId as string} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{a.applicationNo as string}</td>
                    <td className="px-4 py-3">{a.studentName as string}</td>
                    <td className="px-4 py-3">{a.guardianName as string}</td>
                    <td className="px-4 py-3">{cls?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusBadge[status] ?? ""}`}>
                        {status.replace("app_", "").replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canReview && (
                        <>
                          <button onClick={() => handleAction(a.publicId as string, "approve")} className="mr-2 text-xs text-green-600 hover:underline">Approve</button>
                          <button onClick={() => handleAction(a.publicId as string, "reject")} className="text-xs text-red-600 hover:underline">Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
