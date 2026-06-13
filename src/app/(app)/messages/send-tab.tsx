"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ClientApiError } from "@/lib/client-api";
import type { Template, ClassOption } from "./types";

export function SendTab() {
  const t = useTranslations("messages");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyNe, setBodyNe] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Template[]>("/api/notifications/templates?pageSize=50"),
      api<ClassOption[]>("/api/classes"),
    ])
      .then(([tRes, cRes]) => {
        if (!cancelled) {
          setTemplates(tRes.data);
          setClasses(cRes.data);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("error"));
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const selectedClassObj = classes.find((c) => c.publicId === selectedClass);
  const sections = selectedClassObj?.sections ?? [];

  function handleTemplateChange(slug: string) {
    setSelectedTemplate(slug);
    const tmpl = templates.find((t) => t.slug === slug);
    if (tmpl) {
      setBodyEn(tmpl.bodyEn);
      setBodyNe(tmpl.bodyNe ?? "");
    }
  }

  async function handleSend() {
    setError("");
    setResult(null);
    setSending(true);
    try {
      const payload: Record<string, unknown> = {};
      if (selectedTemplate) {
        payload.templateSlug = selectedTemplate;
      } else {
        payload.bodyEn = bodyEn;
        if (bodyNe) payload.bodyNe = bodyNe;
      }
      if (selectedSection) payload.sectionPublicId = selectedSection;
      else if (selectedClass) payload.classPublicId = selectedClass;

      const r = await api<{ sent: number; failed: number; total: number }>(
        "/api/notifications/send",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setResult(r.data);
    } catch (err) {
      if (err instanceof ClientApiError) setError(err.message);
      else setError(t("error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("sendMessage")}</h2>
        <p className="mt-1 text-sm text-muted">{t("selectRecipients")}</p>

        <div className="mt-5 space-y-4">
          {/* Class/Section selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("class")}</label>
              <select
                value={selectedClass}
                onChange={(e) => { setSelectedClass(e.target.value); setSelectedSection(""); }}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c.publicId} value={c.publicId}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("section")}</label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                disabled={!selectedClass}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">— All sections —</option>
                {sections.map((s) => (
                  <option key={s.publicId} value={s.publicId}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Template selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("template")}</label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t("noTemplate")}</option>
              {templates.filter((t) => t.isActive).map((tmpl) => (
                <option key={tmpl.slug} value={tmpl.slug}>{tmpl.name}</option>
              ))}
            </select>
          </div>

          {/* Message body */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("messageEn")}</label>
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="Dear {{guardianName}}, ..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("messageNe")}</label>
            <textarea
              value={bodyNe}
              onChange={(e) => setBodyNe(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground font-nepali"
              placeholder="नमस्कार {{guardianName}}, ..."
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</div>
          )}

          {result && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              {t("sendResult", { sent: result.sent, failed: result.failed, total: result.total })}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || (!bodyEn && !selectedTemplate) || (!selectedClass)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? t("sending") : t("send")}
          </button>
        </div>
      </div>

      {/* Process events section */}
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("processEvents")}</h2>
        <p className="mt-1 text-sm text-muted">{t("processEventsHint")}</p>
        <ProcessEventsButton />
      </div>
    </div>
  );
}

function ProcessEventsButton() {
  const t = useTranslations("messages");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ processed: number; sent: number; failed: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  async function handleProcess() {
    setProcessing(true);
    setResult(null);
    setError("");
    try {
      const r = await api<{ processed: number; sent: number; failed: number; skipped: number }>(
        "/api/notifications/process",
        { method: "POST" },
      );
      setResult(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={handleProcess}
        disabled={processing}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {processing ? t("sending") : t("processEvents")}
      </button>
      {result && (
        <p className="mt-2 text-sm text-muted">
          {t("processed", result)}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>
      )}
    </div>
  );
}
