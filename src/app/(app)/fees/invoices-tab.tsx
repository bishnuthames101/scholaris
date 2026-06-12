"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Plus, Printer, ReceiptText, Search } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { adToBs, bsMonthName, toNepaliDigits } from "@/lib/dates/bs";
import { formatNpr, nprToPaisa, paisaToNpr } from "@/lib/fees/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ClassOption } from "../students/types";
import type {
  GenerateResult,
  InitiateResult,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceStatus,
  PaymentMethod,
} from "./types";

const PAGE_SIZE = 20;
const STATUS_TONE: Record<InvoiceStatus, "info" | "warning" | "success" | "neutral"> = {
  issued: "info",
  partially_paid: "warning",
  paid: "success",
  void: "neutral",
};
const METHODS: PaymentMethod[] = ["cash", "bank", "esewa", "khalti"];

function periodLabel(row: { bsYear: number | null; bsMonth: number | null }, locale: "en" | "ne") {
  if (!row.bsYear) return "—";
  const year = locale === "ne" ? toNepaliDigits(row.bsYear) : String(row.bsYear);
  return row.bsMonth ? `${bsMonthName(row.bsMonth, locale)} ${year}` : year;
}

/** Submit an eSewa-style form initiation in a new tab. */
function submitGatewayForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.target = "_blank";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export function InvoicesTab() {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ne";
  const todayBs = useMemo(() => adToBs(new Date()), []);

  // List state
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Generate dialog
  const [genOpen, setGenOpen] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [genClassId, setGenClassId] = useState("");
  const [genSectionId, setGenSectionId] = useState("");
  const [genBsYear, setGenBsYear] = useState(String(todayBs.year));
  const [genBsMonth, setGenBsMonth] = useState(String(todayBs.month));
  const [genDueDate, setGenDueDate] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);

  // Detail dialog
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Payment form (inside detail)
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  // Void form
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    api<InvoiceListRow[]>(`/api/fees/invoices?${params}`)
      .then((r) => {
        if (cancelled) return;
        setRows(r.data);
        setTotal(r.meta?.total ?? r.data.length);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [page, q, status, refreshKey, tc]);

  useEffect(() => {
    api<ClassOption[]>("/api/classes")
      .then((r) => setClasses(r.data))
      .catch(() => {});
  }, []);

  const loadDetail = useCallback(
    (id: string) => {
      api<InvoiceDetail>(`/api/fees/invoices/${id}`)
        .then((r) => {
          setDetail(r.data);
          setDetailError(null);
          setPayAmount(paisaToNpr(Math.max(0, r.data.totalPaisa - r.data.paidPaisa)));
        })
        .catch((e) => setDetailError(e instanceof Error ? e.message : tc("error")));
    },
    [tc],
  );

  function openDetail(id: string) {
    setDetail(null);
    setDetailError(null);
    setPayNotice(null);
    setPayMethod("cash");
    setPayReference("");
    setDetailId(id);
    loadDetail(id);
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setPayNotice(null);
  }

  async function generate() {
    if (!genClassId) return;
    setGenBusy(true);
    setGenError(null);
    setGenResult(null);
    try {
      const { data } = await api<GenerateResult>("/api/fees/invoices/generate", {
        method: "POST",
        body: JSON.stringify({
          classId: genClassId,
          ...(genSectionId ? { sectionId: genSectionId } : {}),
          bsYear: Number(genBsYear),
          bsMonth: Number(genBsMonth),
          ...(genDueDate ? { dueDate: genDueDate } : {}),
        }),
      });
      setGenResult(data);
      setPage(1);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setGenError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setGenBusy(false);
    }
  }

  async function recordPayment() {
    if (!detail) return;
    setPayBusy(true);
    setPayNotice(null);
    setDetailError(null);
    try {
      const { data } = await api<{
        paymentId: string;
        status: "completed" | "pending";
        receiptNo?: string;
        initiation?: InitiateResult;
      }>("/api/fees/payments", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: detail.publicId,
          method: payMethod,
          amountPaisa: nprToPaisa(payAmount),
          ...(payReference.trim() ? { reference: payReference.trim() } : {}),
        }),
      });
      if (data.status === "completed") {
        setPayNotice(t("paymentRecorded", { receipt: data.receiptNo ?? "" }));
      } else if (data.initiation?.kind === "form") {
        submitGatewayForm(data.initiation.action, data.initiation.fields);
        setPayNotice(t("gatewayOpened"));
      } else if (data.initiation?.kind === "redirect") {
        window.open(data.initiation.url, "_blank", "noopener");
        setPayNotice(t("gatewayOpened"));
      }
      setPayReference("");
      loadDetail(detail.publicId);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setDetailError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setPayBusy(false);
    }
  }

  async function verifyPayment(paymentId: string) {
    if (!detail) return;
    setPayBusy(true);
    setDetailError(null);
    try {
      const { data } = await api<{ status: string; receiptNo?: string }>(
        `/api/fees/payments/${paymentId}/verify`,
        { method: "POST" },
      );
      setPayNotice(
        data.status === "completed"
          ? t("paymentRecorded", { receipt: data.receiptNo ?? "" })
          : t("verifyFailed"),
      );
      loadDetail(detail.publicId);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setDetailError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setPayBusy(false);
    }
  }

  async function voidInvoice() {
    if (!detail || voidReason.trim().length < 3) return;
    setVoidBusy(true);
    setDetailError(null);
    try {
      await api(`/api/fees/invoices/${detail.publicId}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setVoidOpen(false);
      setVoidReason("");
      loadDetail(detail.publicId);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setDetailError(e instanceof ClientApiError ? e.message : tc("error"));
    } finally {
      setVoidBusy(false);
    }
  }

  const genSections = classes.find((c) => c.publicId === genClassId)?.sections ?? [];
  const outstanding = detail ? Math.max(0, detail.totalPaisa - detail.paidPaisa) : 0;
  const canPay = detail !== null && detail.status !== "void" && outstanding > 0;
  const canVoid =
    detail !== null &&
    detail.status !== "void" &&
    !detail.payments.some((p) => p.status === "completed");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder={t("searchInvoices")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label={t("status")}
          >
            <option value="">{t("allStatuses")}</option>
            {(["issued", "partially_paid", "paid", "void"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          onClick={() => {
            setGenResult(null);
            setGenError(null);
            setGenOpen(true);
          }}
        >
          <Plus className="size-4" />
          {t("generateInvoices")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* List */}
      {!rows ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("noInvoices")}
          description={t("noInvoicesHint")}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("invoiceNo")}</TH>
              <TH>{t("student")}</TH>
              <TH>{t("period")}</TH>
              <TH className="text-right">{t("total")}</TH>
              <TH className="text-right">{t("paid")}</TH>
              <TH>{t("status")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.publicId} interactive onClick={() => openDetail(row.publicId)}>
                <TD className="font-medium">{row.invoiceNo}</TD>
                <TD>
                  <span className="block truncate">
                    {locale === "ne" && row.student.nameNe ? row.student.nameNe : row.student.name}
                  </span>
                  <span className="text-xs text-faint">{row.student.admissionNo}</span>
                </TD>
                <TD>{periodLabel(row, locale)}</TD>
                <TD className="text-right tabular-nums">{formatNpr(row.totalPaisa, locale)}</TD>
                <TD className="text-right tabular-nums">{formatNpr(row.paidPaisa, locale)}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[row.status]}>{t(`status_${row.status}`)}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {/* Generate dialog */}
      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title={t("generateInvoices")}>
        <div className="space-y-4">
          {genError && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {genError}
            </p>
          )}
          {genResult && (
            <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">
              {t("generateResult", {
                created: genResult.created,
                skipped: genResult.skipped,
                total: formatNpr(genResult.totalPaisa, locale),
              })}
            </p>
          )}
          <Field label={t("class")} required>
            <Select
              value={genClassId}
              onChange={(e) => {
                setGenClassId(e.target.value);
                setGenSectionId("");
              }}
            >
              <option value="">{t("class")}…</option>
              {classes.map((c) => (
                <option key={c.publicId} value={c.publicId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("section")}>
            <Select
              value={genSectionId}
              onChange={(e) => setGenSectionId(e.target.value)}
              disabled={genSections.length === 0}
            >
              <option value="">{t("allSections")}</option>
              {genSections.map((s) => (
                <option key={s.publicId} value={s.publicId}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("bsYear")} required>
              <Input
                inputMode="numeric"
                value={genBsYear}
                onChange={(e) => setGenBsYear(e.target.value)}
              />
            </Field>
            <Field label={t("bsMonth")} required>
              <Select value={genBsMonth} onChange={(e) => setGenBsMonth(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {bsMonthName(m, locale)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("dueDateAd")}>
            <Input type="date" value={genDueDate} onChange={(e) => setGenDueDate(e.target.value)} />
          </Field>
          <p className="text-xs text-muted">{t("generateHint")}</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={generate} loading={genBusy} disabled={!genClassId || !genBsYear}>
              {t("generate")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={detailId !== null}
        onClose={closeDetail}
        title={detail?.invoiceNo ?? t("invoice")}
        className="max-w-2xl"
      >
        {!detail ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-5">
            {detailError && (
              <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
                {detailError}
              </p>
            )}
            {payNotice && (
              <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">
                {payNotice}
              </p>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {locale === "ne" && detail.student.nameNe
                    ? detail.student.nameNe
                    : detail.student.name}{" "}
                  <span className="text-faint">· {detail.student.admissionNo}</span>
                </p>
                <p className="text-xs text-muted">
                  {detail.student.enrollments[0]
                    ? `${detail.student.enrollments[0].section.class.name} — ${detail.student.enrollments[0].section.name}`
                    : ""}
                  {" · "}
                  {periodLabel(detail, locale)} · {detail.fiscalYear}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[detail.status]}>{t(`status_${detail.status}`)}</Badge>
                {canVoid && (
                  <Button size="sm" variant="outline" onClick={() => setVoidOpen(true)}>
                    {t("voidInvoice")}
                  </Button>
                )}
              </div>
            </div>

            {detail.status === "void" && detail.voidReason && (
              <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted">
                {t("voidReason")}: {detail.voidReason}
              </p>
            )}

            {/* Items */}
            <div>
              <Table>
                <THead>
                  <tr>
                    <TH>{t("item")}</TH>
                    <TH className="text-right">{t("amount")}</TH>
                    <TH className="text-right">{t("discount")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {detail.items.map((item, i) => (
                    <TR key={i}>
                      <TD>
                        {locale === "ne" && item.labelNe ? item.labelNe : item.label}
                        {item.kind === "fine" && (
                          <Badge tone="warning" className="ml-2">
                            {t("fine")}
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatNpr(item.amountPaisa, locale)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {item.discountPaisa > 0 ? `−${formatNpr(item.discountPaisa, locale)}` : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="mt-2 space-y-1 rounded-md bg-surface-muted px-4 py-3 text-sm">
                <div className="flex justify-between text-muted">
                  <span>{t("total")}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatNpr(detail.totalPaisa, locale)}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>{t("paid")}</span>
                  <span className="tabular-nums">{formatNpr(detail.paidPaisa, locale)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>{t("outstanding")}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatNpr(outstanding, locale)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payments */}
            {detail.payments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{t("payments")}</h3>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {detail.payments.map((p) => (
                    <li key={p.publicId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {p.receiptNo ?? t(`method_${p.method}`)}
                        <span className="ml-2 text-xs text-faint">{t(`method_${p.method}`)}</span>
                      </span>
                      <span className="tabular-nums">{formatNpr(p.amountPaisa, locale)}</span>
                      <Badge
                        tone={
                          p.status === "completed"
                            ? "success"
                            : p.status === "pending"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {t(`paystatus_${p.status}`)}
                      </Badge>
                      {p.status === "completed" && (
                        <a
                          href={`/api/fees/payments/${p.publicId}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                          aria-label={t("printReceipt")}
                        >
                          <Printer className="size-4" />
                        </a>
                      )}
                      {p.status === "pending" &&
                        (p.method === "esewa" || p.method === "khalti") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payBusy}
                            onClick={() => verifyPayment(p.publicId)}
                          >
                            {t("verify")}
                          </Button>
                        )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Record payment */}
            {canPay && (
              <div className="rounded-md border border-border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ReceiptText className="size-4 text-brand-600" />
                  {t("recordPayment")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t("method")}>
                    <Select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {t(`method_${m}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("amountNpr")}>
                    <Input
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </Field>
                  {payMethod === "bank" && (
                    <Field label={t("reference")}>
                      <Input
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder={t("referenceHint")}
                      />
                    </Field>
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={recordPayment}
                    loading={payBusy}
                    disabled={payAmount.trim() === ""}
                  >
                    {payMethod === "cash" || payMethod === "bank"
                      ? t("collect")
                      : t("payOnline")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Void dialog */}
      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} title={t("voidInvoice")}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("voidHint")}</p>
          <Field label={t("voidReason")} required>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={voidInvoice}
              loading={voidBusy}
              disabled={voidReason.trim().length < 3}
            >
              {t("voidConfirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
