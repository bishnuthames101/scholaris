"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type Invoice = {
  publicId: string;
  invoiceNo: string;
  totalPaisa: number;
  paidPaisa: number;
  discountPaisa: number;
  status: string;
  issueDate: string;
  dueDate: string | null;
  items: { label: string; labelNe: string | null; amountPaisa: number; discountPaisa: number }[];
};

type Payment = {
  publicId: string;
  amountPaisa: number;
  method: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  receiptNo: string | null;
  invoice: { invoiceNo: string };
};

export default function PortalFeesPage() {
  const t = useTranslations("portal");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const studentId = params.get("student");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedInv, setExpandedInv] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    const qs = new URLSearchParams({ student: studentId, page: String(page), pageSize: "20" });
    api<{ invoices: Invoice[]; payments: Payment[] }>(`/api/portal/fees?${qs}`)
      .then((r) => {
        setInvoices(r.data.invoices);
        setPayments(r.data.payments);
        setTotal(r.meta?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, studentId]);

  const totalPages = Math.ceil(total / 20);

  if (!studentId) {
    return <p className="py-12 text-center text-sm text-muted">{t("selectChild")}</p>;
  }

  const totalDue = invoices.reduce((s, i) => s + (i.totalPaisa - i.paidPaisa), 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidPaisa, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t("feesPayments")}</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-medium text-muted">{t("totalPaid")}</p>
              <p className="mt-1 text-2xl font-bold text-green-600">
                Rs {(totalPaid / 100).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-medium text-muted">{t("balanceDue")}</p>
              <p className={cn("mt-1 text-2xl font-bold", totalDue > 0 ? "text-red-600" : "text-green-600")}>
                Rs {(totalDue / 100).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Invoices */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">{t("invoices")}</h2>
            {invoices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
                {t("noInvoices")}
              </p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => {
                  const balance = inv.totalPaisa - inv.paidPaisa;
                  const expanded = expandedInv === inv.publicId;
                  return (
                    <div key={inv.publicId} className="rounded-lg border border-border bg-surface">
                      <button
                        onClick={() => setExpandedInv(expanded ? null : inv.publicId)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{inv.invoiceNo}</p>
                          <p className="text-xs text-muted">
                            {new Date(inv.issueDate).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                            {inv.dueDate && ` — Due: ${new Date(inv.dueDate).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short",
                            })}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono font-semibold text-foreground">
                            Rs {(inv.totalPaisa / 100).toLocaleString()}
                          </p>
                          <InvoiceStatusBadge status={inv.status} balance={balance} />
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-border px-4 py-3">
                          <table className="w-full text-sm">
                            <tbody>
                              {inv.items.map((item, i) => (
                                <tr key={i} className="border-b border-border last:border-0">
                                  <td className="py-1.5 text-foreground">{item.label}</td>
                                  <td className="py-1.5 text-right font-mono text-muted">
                                    Rs {(item.amountPaisa / 100).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {inv.discountPaisa > 0 && (
                            <p className="mt-2 text-xs text-green-600">
                              {t("discount")}: Rs {(inv.discountPaisa / 100).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent payments */}
          {payments.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">{t("recentPayments")}</h2>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.publicId} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {p.invoice.invoiceNo}
                      </p>
                      <p className="text-xs text-muted">
                        {p.paidAt
                          ? new Date(p.paidAt).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })
                          : new Date(p.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                        {p.receiptNo && ` — ${p.receiptNo}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-semibold text-green-600">
                        Rs {(p.amountPaisa / 100).toLocaleString()}
                      </p>
                      <span className="text-xs capitalize text-muted">{p.method}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} {t("invoices")}</span>
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

function InvoiceStatusBadge({ status, balance }: { status: string; balance: number }) {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    issued: balance > 0 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    void: "bg-gray-100 text-gray-600",
    partial: "bg-orange-100 text-orange-800",
  };
  const label = status === "issued" && balance <= 0 ? "paid" : status;
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", colors[status] ?? "bg-gray-100 text-gray-600")}>
      {label}
    </span>
  );
}
