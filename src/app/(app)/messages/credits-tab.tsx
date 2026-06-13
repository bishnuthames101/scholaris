"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ClientApiError } from "@/lib/client-api";
import type { CreditBalance } from "./types";

export function CreditsTab() {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const [data, setData] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [topUpReason, setTopUpReason] = useState("topup");
  const [topUpSaving, setTopUpSaving] = useState(false);
  const [topUpMsg, setTopUpMsg] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api<CreditBalance>("/api/notifications/credits?pageSize=50")
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    setTopUpSaving(true);
    setTopUpMsg("");
    try {
      const r = await api<{ balance: number }>("/api/notifications/credits/topup", {
        method: "POST",
        body: JSON.stringify({ amount: Number(topUpAmount), reason: topUpReason }),
      });
      setTopUpMsg(t("topUpDone", { amount: topUpAmount, balance: r.data.balance }));
      setShowTopUp(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ClientApiError) setTopUpMsg(err.message);
    } finally {
      setTopUpSaving(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{tc("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">{t("balance")}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{data?.balance ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">{t("totalUsed")}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{data?.totalUsed ?? 0}</p>
        </div>
        <div className="flex items-center rounded-lg border border-border bg-surface p-5 shadow-sm">
          <button
            onClick={() => setShowTopUp(true)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t("topUp")}
          </button>
        </div>
      </div>

      {/* Top up form */}
      {showTopUp && (
        <form
          onSubmit={handleTopUp}
          className="max-w-md rounded-lg border border-border bg-surface p-5 shadow-sm space-y-3"
        >
          <h3 className="font-semibold text-foreground">{t("topUp")}</h3>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("topUpAmount")}</label>
            <input
              type="number"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              min={1}
              max={100000}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("topUpReason")}</label>
            <input
              type="text"
              value={topUpReason}
              onChange={(e) => setTopUpReason(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={topUpSaving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {topUpSaving ? "…" : t("topUp")}
            </button>
            <button
              type="button"
              onClick={() => setShowTopUp(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {topUpMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{topUpMsg}</div>
      )}

      {/* Transaction history */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">{t("transactions")}</h3>
        {!data || data.transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted">{t("noTransactions")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-raised">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted">{t("balance")}</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.transactions.map((tx) => (
                  <tr key={tx.publicId}>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-foreground">{tx.balanceAfter}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{tx.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
