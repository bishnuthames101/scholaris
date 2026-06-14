"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Book = {
  publicId: string;
  accessionNo: string;
  isbn: string | null;
  title: string;
  titleNe: string | null;
  author: string | null;
  publisher: string | null;
  category: string | null;
  copies: number;
  availableCopies: number;
  shelfLocation: string | null;
  _count: { issues: number };
};

type Issue = {
  publicId: string;
  borrowerType: string;
  issuedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: string;
  finePaisa: number;
  fineCollected: boolean;
  note: string | null;
  book: { publicId: string; title: string; accessionNo: string };
  student: { publicId: string; name: string; nameNe: string | null } | null;
  staff: { publicId: string; name: string; nameNe: string | null } | null;
};

type Student = { publicId: string; name: string; nameNe: string | null };
type Staff = { publicId: string; name: string; nameNe: string | null };

type Tab = "catalog" | "issues";

export default function LibraryPage() {
  const t = useTranslations("library");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("catalog");
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
        {(["catalog", "issues"] as Tab[]).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2
                ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t2 === "catalog" ? t("tabCatalog") : t("tabIssues")}
          </button>
        ))}
      </div>

      {tab === "catalog" && <CatalogTab onError={setError} />}
      {tab === "issues" && <IssuesTab onError={setError} />}
    </div>
  );
}

/* =====================================================================
 * Catalog Tab
 * =================================================================== */

function CatalogTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({
    accessionNo: "", title: "", titleNe: "", author: "", isbn: "",
    publisher: "", category: "", shelfLocation: "", copies: "1",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) params.set("search", search.trim());
    api<Book[]>(`/api/library/books?${params}`)
      .then((r) => { setBooks(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, search, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/library/books", {
        method: "POST",
        body: JSON.stringify({
          accessionNo: form.accessionNo,
          title: form.title,
          titleNe: form.titleNe || undefined,
          author: form.author || undefined,
          isbn: form.isbn || undefined,
          publisher: form.publisher || undefined,
          category: form.category || undefined,
          shelfLocation: form.shelfLocation || undefined,
          copies: parseInt(form.copies, 10) || 1,
        }),
      });
      setShowAdd(false);
      setForm({ accessionNo: "", title: "", titleNe: "", author: "", isbn: "", publisher: "", category: "", shelfLocation: "", copies: "1" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/api/library/books/${id}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm"
        />
        <div className="ml-auto">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t("addBook")}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder={t("accessionNo")} value={form.accessionNo} onChange={(e) => setForm({ ...form, accessionNo: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input required placeholder={t("bookTitle")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={`${t("bookTitle")} (ने)`} value={form.titleNe} onChange={(e) => setForm({ ...form, titleNe: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("author")} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("isbn")} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("publisher")} value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("category")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("shelfLocation")} value={form.shelfLocation} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input type="number" min="1" max="1000" placeholder={t("copies")} value={form.copies} onChange={(e) => setForm({ ...form, copies: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? tc("saving") : tc("save")}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : books.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noBooks")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noBooksHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("accessionNo")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("bookTitle")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("author")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("category")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("copies")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("available")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("shelfLocation")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {books.map((b) => (
                <tr key={b.publicId} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{b.accessionNo}</td>
                  <td className="px-4 py-3">{b.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.author ?? "—"}</td>
                  <td className="px-4 py-3">
                    {b.category && (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {b.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{b.copies}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={b.availableCopies === 0 ? "font-medium text-red-600" : "text-green-600"}>
                      {b.availableCopies}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.shelfLocation ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(b.publicId)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tc("page")} {page} / {totalPages} ({total} {tc("total")})
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">
              {tc("prev")}
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">
              {tc("next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
 * Issues Tab
 * =================================================================== */

function IssuesTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("issued");
  const [loading, setLoading] = useState(true);
  const [showIssue, setShowIssue] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Issue form
  const [books, setBooks] = useState<Book[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [issueForm, setIssueForm] = useState({ bookId: "", borrowerType: "student" as "student" | "staff", borrowerId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20", status: statusFilter });
    api<Issue[]>(`/api/library/issues?${params}`)
      .then((r) => { setIssues(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, statusFilter, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  // Load books/students/staff for the issue form
  useEffect(() => {
    if (!showIssue) return;
    Promise.all([
      api<Book[]>("/api/library/books?pageSize=200").then((r) => setBooks(r.data)),
      api<Student[]>("/api/students?pageSize=500").then((r) => setStudents(r.data)),
      api<Staff[]>("/api/staff?pageSize=200").then((r) => setStaffList(r.data)),
    ]).catch((e) => onError(e instanceof Error ? e.message : tc("error")));
  }, [showIssue, onError, tc]);

  async function handleIssueBook(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/library/issues", {
        method: "POST",
        body: JSON.stringify({
          bookId: issueForm.bookId,
          borrowerType: issueForm.borrowerType,
          borrowerId: issueForm.borrowerId,
        }),
      });
      setShowIssue(false);
      setIssueForm({ bookId: "", borrowerType: "student", borrowerId: "" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(issueId: string) {
    try {
      await api(`/api/library/issues/${issueId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "return" }),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  function daysDiff(dueAt: string): number {
    return Math.ceil((Date.now() - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  const totalPages = Math.ceil(total / 20);
  const borrowerOptions = issueForm.borrowerType === "student" ? students : staffList;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="issued">{t("status_issued")}</option>
          <option value="returned">{t("status_available")}</option>
          <option value="lost">{t("status_lost")}</option>
        </select>
        <div className="ml-auto">
          <button
            onClick={() => setShowIssue(!showIssue)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t("issueBook")}
          </button>
        </div>
      </div>

      {showIssue && (
        <form onSubmit={handleIssueBook} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <select required value={issueForm.bookId} onChange={(e) => setIssueForm({ ...issueForm, bookId: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("bookTitle")}…</option>
            {books.filter((b) => b.availableCopies > 0).map((b) => (
              <option key={b.publicId} value={b.publicId}>{b.accessionNo} — {b.title} ({b.availableCopies} {t("available")})</option>
            ))}
          </select>
          <select value={issueForm.borrowerType} onChange={(e) => setIssueForm({ ...issueForm, borrowerType: e.target.value as "student" | "staff", borrowerId: "" })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="student">{t("student")}</option>
            <option value="staff">{t("staffMember")}</option>
          </select>
          <select required value={issueForm.borrowerId} onChange={(e) => setIssueForm({ ...issueForm, borrowerId: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("borrower")}…</option>
            {borrowerOptions.map((b) => (
              <option key={b.publicId} value={b.publicId}>{b.name}</option>
            ))}
          </select>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? tc("saving") : t("issueBook")}
            </button>
            <button type="button" onClick={() => setShowIssue(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : issues.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noActiveIssues")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noActiveIssuesHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("bookTitle")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("accessionNo")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("borrower")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("issuedAt")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("dueAt")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
                {statusFilter === "issued" && (
                  <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {issues.map((iss) => {
                const overdueDays = iss.status === "issued" ? daysDiff(iss.dueAt) : 0;
                const borrowerName = iss.student?.name ?? iss.staff?.name ?? "—";

                return (
                  <tr key={iss.publicId} className="hover:bg-muted/30">
                    <td className="px-4 py-3">{iss.book.title}</td>
                    <td className="px-4 py-3 font-mono text-xs">{iss.book.accessionNo}</td>
                    <td className="px-4 py-3">
                      <span>{borrowerName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({iss.borrowerType})</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(iss.issuedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={overdueDays > 0 ? "font-medium text-red-600" : ""}>
                        {new Date(iss.dueAt).toLocaleDateString()}
                      </span>
                      {overdueDays > 0 && (
                        <span className="ml-1 text-xs text-red-500">
                          ({t("overdueBy", { days: overdueDays })})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        iss.status === "issued" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                        iss.status === "returned" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                      }`}>
                        {t(`status_${iss.status}`)}
                      </span>
                    </td>
                    {statusFilter === "issued" && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleReturn(iss.publicId)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {t("returnBook")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tc("page")} {page} / {totalPages} ({total} {tc("total")})
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">
              {tc("prev")}
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">
              {tc("next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
