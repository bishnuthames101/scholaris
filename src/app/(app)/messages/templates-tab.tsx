"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ClientApiError } from "@/lib/client-api";
import type { Template } from "./types";

export function TemplatesTab() {
  const t = useTranslations("messages");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api<Template[]>("/api/notifications/templates?pageSize=100")
      .then((r) => setTemplates(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  function handleSaved() {
    setShowCreate(false);
    setEditing(null);
    setRefreshKey((k) => k + 1);
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{t("noTemplates")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>
      )}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => { setShowCreate(true); setEditing(null); }}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t("createTemplate")}
        </button>
      </div>

      {(showCreate || editing) && (
        <TemplateForm
          template={editing}
          onSaved={handleSaved}
          onCancel={() => { setShowCreate(false); setEditing(null); }}
        />
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noTemplates")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-raised">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted">{t("templateName")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted">{t("templateSlug")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted">{t("variables")}</th>
                <th className="px-4 py-3 text-center font-medium text-muted">{t("system")}</th>
                <th className="px-4 py-3 text-center font-medium text-muted">{t("active")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((tmpl) => (
                <tr key={tmpl.publicId} className="hover:bg-surface-raised/50">
                  <td className="px-4 py-3 font-medium text-foreground">{tmpl.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{tmpl.slug}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {tmpl.variables.map((v) => (
                      <span key={v} className="mr-1 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tmpl.isSystem && (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {t("system")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        tmpl.isActive ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditing(tmpl); setShowCreate(false); }}
                      className="text-sm text-brand-600 hover:text-brand-800"
                    >
                      {t("editTemplate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  template,
  onSaved,
  onCancel,
}: {
  template: Template | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [bodyEn, setBodyEn] = useState(template?.bodyEn ?? "");
  const [bodyNe, setBodyNe] = useState(template?.bodyNe ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await api(`/api/notifications/templates/${template.publicId}`, {
          method: "PATCH",
          body: JSON.stringify({ name, bodyEn, bodyNe: bodyNe || null, isActive }),
        });
      } else {
        await api("/api/notifications/templates", {
          method: "POST",
          body: JSON.stringify({ name, slug, bodyEn, bodyNe: bodyNe || undefined, variables: extractVars(bodyEn) }),
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ClientApiError) setError(err.message);
      else setError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-semibold text-foreground">
        {isEdit ? t("editTemplate") : t("createTemplate")}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">{t("templateName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            required
          />
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("templateSlug")}</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
              required
              pattern="^[a-z0-9_]+$"
            />
            <p className="mt-0.5 text-xs text-muted">{t("templateSlugHint")}</p>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t("bodyEn")}</label>
        <textarea
          value={bodyEn}
          onChange={(e) => setBodyEn(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t("bodyNe")}</label>
        <textarea
          value={bodyNe}
          onChange={(e) => setBodyNe(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-nepali"
        />
      </div>

      {bodyEn && (
        <div>
          <p className="text-xs font-medium text-muted">{t("variables")}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {extractVars(bodyEn).map((v) => (
              <span key={v} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-border"
          />
          {t("active")}
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "…" : tc("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
        >
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}

function extractVars(body: string): string[] {
  const vars = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) vars.add(m[1]);
  return [...vars];
}
