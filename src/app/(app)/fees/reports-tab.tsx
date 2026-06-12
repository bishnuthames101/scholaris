"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3, Printer, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client-api";
import { formatNpr } from "@/lib/fees/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { AgingReport, DailyCollection, Statement } from "./types";

type Report = "aging" | "daily" | "statement";

export function ReportsTab() {
  const t = useTranslations("fees");
  const locale = useLocale() as "en" | "ne";
  const [report, setReport] = useState<Report>("aging");

  const reports: { id: Report; label: string }[] = [
    { id: "aging", label: t("reportAging") },
    { id: "daily", label: t("reportDaily") },
    { id: "statement", label: t("reportStatement") },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => setReport(r.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              report === r.id
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {report === "aging" && <AgingSection locale={locale} />}
      {report === "daily" && <DailySection locale={locale} />}
      {report === "statement" && <StatementSection locale={locale} />}
    </div>
  );
}

function AgingSection({ locale }: { locale: "en" | "ne" }) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const [data, setData] = useState<AgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AgingReport>("/api/fees/reports/aging")
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")));
  }, [tc]);

  if (error)
    return (
      <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  if (!data)
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-6 text-brand-600" />
      </div>
    );
  if (data.rows.length === 0)
    return <EmptyState icon={BarChart3} title={t("noDues")} description={t("noDuesHint")} />;

  return (
    <Table>
      <THead>
        <tr>
          <TH>{t("student")}</TH>
          <TH>{t("class")}</TH>
          <TH className="text-right">{t("agingCurrent")}</TH>
          <TH className="text-right">{t("aging1_30")}</TH>
          <TH className="text-right">{t("aging31_60")}</TH>
          <TH className="text-right">{t("aging61_90")}</TH>
          <TH className="text-right">{t("aging90p")}</TH>
          <TH className="text-right">{t("total")}</TH>
        </tr>
      </THead>
      <TBody>
        {data.rows.map((r) => (
          <TR key={r.studentId}>
            <TD>
              <span className="block truncate">{r.name}</span>
              <span className="text-xs text-faint">{r.admissionNo}</span>
            </TD>
            <TD>{r.className ?? "—"}</TD>
            <TD className="text-right tabular-nums">{formatNpr(r.currentPaisa, locale)}</TD>
            <TD className="text-right tabular-nums">{formatNpr(r.d1_30Paisa, locale)}</TD>
            <TD className="text-right tabular-nums">{formatNpr(r.d31_60Paisa, locale)}</TD>
            <TD className="text-right tabular-nums">{formatNpr(r.d61_90Paisa, locale)}</TD>
            <TD className="text-right tabular-nums">{formatNpr(r.d90pPaisa, locale)}</TD>
            <TD className="text-right font-semibold tabular-nums">
              {formatNpr(r.totalPaisa, locale)}
            </TD>
          </TR>
        ))}
        <tr className="bg-surface-muted/60 font-semibold">
          <TD colSpan={2}>{t("totals")}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.currentPaisa, locale)}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.d1_30Paisa, locale)}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.d31_60Paisa, locale)}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.d61_90Paisa, locale)}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.d90pPaisa, locale)}</TD>
          <TD className="text-right tabular-nums">{formatNpr(data.totals.totalPaisa, locale)}</TD>
        </tr>
      </TBody>
    </Table>
  );
}

function DailySection({ locale }: { locale: "en" | "ne" }) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DailyCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<DailyCollection>(`/api/fees/reports/daily-collection?date=${date}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [date, tc]);

  // Data for a previous date is stale while the new fetch is in flight.
  const current = data && data.date === date ? data : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t("date")}
          />
        </div>
        {current && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-brand-50 px-3 py-1.5 font-semibold text-brand-800">
              {t("total")}: {formatNpr(current.totalPaisa, locale)}
            </span>
            {Object.entries(current.byMethod).map(([m, v]) => (
              <span key={m} className="rounded-md bg-surface-muted px-3 py-1.5 text-muted">
                {t(`method_${m}`)}: {formatNpr(v.totalPaisa, locale)} ({v.count})
              </span>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : !current ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : current.payments.length === 0 ? (
        <EmptyState icon={BarChart3} title={t("noCollections")} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("receiptNo")}</TH>
              <TH>{t("student")}</TH>
              <TH>{t("invoiceNo")}</TH>
              <TH>{t("method")}</TH>
              <TH className="text-right">{t("amount")}</TH>
              <TH className="w-12" />
            </tr>
          </THead>
          <TBody>
            {current.payments.map((p) => (
              <TR key={p.publicId}>
                <TD className="font-medium">{p.receiptNo ?? "—"}</TD>
                <TD>
                  <span className="block truncate">{p.student.name}</span>
                  <span className="text-xs text-faint">{p.student.admissionNo}</span>
                </TD>
                <TD>{p.invoice.invoiceNo}</TD>
                <TD>{t(`method_${p.method}`)}</TD>
                <TD className="text-right tabular-nums">{formatNpr(p.amountPaisa, locale)}</TD>
                <TD>
                  <a
                    href={`/api/fees/payments/${p.publicId}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                    aria-label={t("printReceipt")}
                  >
                    <Printer className="size-4" />
                  </a>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

type StudentHit = { publicId: string; name: string; nameNe: string | null; admissionNo: string };

function StatementSection({ locale }: { locale: "en" | "ne" }) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<StudentHit[]>(`/api/students?search=${encodeURIComponent(query)}&pageSize=8`)
        .then((r) => {
          if (!cancelled) setHits(r.data);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  function pick(student: StudentHit) {
    setQ("");
    setHits([]);
    setLoading(true);
    setError(null);
    api<Statement>(`/api/fees/students/${student.publicId}/statement`)
      .then((r) => setStatement(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          className="pl-9"
          placeholder={t("statementSearch")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) setHits([]);
          }}
        />
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-overlay">
            {hits.map((s) => (
              <li key={s.publicId}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted"
                  onClick={() => pick(s)}
                >
                  <span>{locale === "ne" && s.nameNe ? s.nameNe : s.name}</span>
                  <span className="text-xs text-faint">{s.admissionNo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : !statement ? (
        <EmptyState icon={Search} title={t("statementEmpty")} description={t("statementHint")} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {locale === "ne" && statement.student.nameNe
                  ? statement.student.nameNe
                  : statement.student.name}{" "}
                <span className="font-normal text-faint">
                  · {statement.student.admissionNo}
                </span>
              </p>
              <p className="text-xs text-muted">
                {[statement.student.className, statement.student.sectionName]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>
            <span
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold",
                statement.totals.balancePaisa > 0
                  ? "bg-danger-bg text-danger"
                  : "bg-success-bg text-success",
              )}
            >
              {t("balance")}: {formatNpr(statement.totals.balancePaisa, locale)}
            </span>
          </div>

          {statement.entries.length === 0 ? (
            <EmptyState icon={BarChart3} title={t("statementNoEntries")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("date")}</TH>
                  <TH>{t("narration")}</TH>
                  <TH className="text-right">{t("debit")}</TH>
                  <TH className="text-right">{t("credit")}</TH>
                  <TH className="text-right">{t("balance")}</TH>
                </tr>
              </THead>
              <TBody>
                {statement.entries.map((e) => (
                  <TR key={e.publicId}>
                    <TD className="whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleDateString(
                        locale === "ne" ? "ne-NP" : "en-GB",
                      )}
                    </TD>
                    <TD>{e.narration ?? t(`ledger_${e.type}`)}</TD>
                    <TD className="text-right tabular-nums">
                      {e.debitPaisa > 0 ? formatNpr(e.debitPaisa, locale) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {e.creditPaisa > 0 ? formatNpr(e.creditPaisa, locale) : "—"}
                    </TD>
                    <TD className="text-right font-medium tabular-nums">
                      {formatNpr(e.balancePaisa, locale)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
