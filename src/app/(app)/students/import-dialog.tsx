"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Upload } from "lucide-react";
import { api } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  async function onImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<ImportResult>("/api/import/students", {
        method: "POST",
        body: form,
      });
      setResult(r.data);
      if (r.data.created > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={t("importTitle")} className="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-muted">{t("importHint")}</p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-3 rounded-md border-2 border-dashed border-border-strong px-4 py-8 text-sm text-muted transition-colors hover:border-brand-600 hover:bg-brand-50/40 hover:text-brand-700"
        >
          <FileSpreadsheet className="size-5" />
          {fileName ?? t("chooseFile")}
        </button>

        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">
              {t("importDone", { created: result.created, failed: result.skipped })}
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                <p className="border-b border-border bg-surface-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("rowErrors")}
                </p>
                <ul className="divide-y divide-border text-sm">
                  {result.errors.map((e, i) => (
                    <li key={i} className="flex gap-3 px-3 py-1.5">
                      <span className="shrink-0 font-mono text-xs text-muted">#{e.row}</span>
                      <span className="text-danger">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {result ? tc("back") : tc("cancel")}
          </Button>
          <Button onClick={onImport} loading={busy} disabled={!fileName}>
            <Upload className="size-4" />
            {busy ? t("importing") : t("importCsv")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
