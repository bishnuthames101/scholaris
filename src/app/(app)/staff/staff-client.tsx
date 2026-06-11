"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Plus, Search } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { BsDate } from "@/components/bs-date";

const PAGE_SIZE = 20;

type StaffRow = {
  publicId: string;
  name: string;
  nameNe?: string | null;
  designation: string;
  phone?: string | null;
  email?: string | null;
  joinedAt?: string | null;
  photoUrl?: string | null;
};

export function StaffClient() {
  const t = useTranslations("staff");
  const tc = useTranslations("common");

  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // add form
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) params.set("search", debounced);
    api<StaffRow[]>(`/api/staff?${params}`)
      .then((r) => {
        if (cancelled) return;
        setStaff(r.data);
        setTotal(r.meta?.total ?? r.data.length);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debounced, refreshKey, tc]);

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api("/api/staff", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          nameNe: nameNe.trim() || undefined,
          designation: designation.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          joinedAt: joinedAt || undefined,
        }),
      });
      setName("");
      setNameNe("");
      setDesignation("");
      setPhone("");
      setEmail("");
      setJoinedAt("");
      setAddOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  const loading = staff === null;
  const empty = !loading && staff.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tc("search")}
          className="pl-9"
          aria-label={tc("search")}
        />
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
          icon={Briefcase}
          title={t("empty")}
          description={t("emptyHint")}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t("add")}
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("name")}</TH>
                <TH>{t("designation")}</TH>
                <TH>{t("phone")}</TH>
                <TH>{t("email")}</TH>
                <TH>{t("joined")}</TH>
              </tr>
            </THead>
            <TBody>
              {staff.map((s) => (
                <TR key={s.publicId}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} src={s.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        {s.nameNe && <p className="truncate text-xs text-muted">{s.nameNe}</p>}
                      </div>
                    </div>
                  </TD>
                  <TD>{s.designation}</TD>
                  <TD>{s.phone ?? "—"}</TD>
                  <TD className="text-muted">{s.email ?? "—"}</TD>
                  <TD>{s.joinedAt ? <BsDate date={new Date(s.joinedAt)} /> : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t("add")} className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("name")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label={`${t("name")} (नेपाली)`}>
              <Input value={nameNe} onChange={(e) => setNameNe(e.target.value)} lang="ne" />
            </Field>
            <Field label={t("designation")} required>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                required
              />
            </Field>
            <Field label={t("joined")}>
              <Input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </Field>
            <Field label={t("phone")}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label={t("email")}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
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
