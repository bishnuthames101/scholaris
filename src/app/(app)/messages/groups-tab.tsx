"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ClientApiError } from "@/lib/client-api";
import type { ContactGroup } from "./types";

export function GroupsTab() {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api<ContactGroup[]>("/api/notifications/groups?pageSize=100")
      .then((r) => setGroups(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleDelete(group: ContactGroup) {
    if (!confirm(t("deleteGroupConfirm", { name: group.name }))) return;
    try {
      await api(`/api/notifications/groups/${group.publicId}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch {}
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{tc("loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t("createGroup")}
        </button>
      </div>

      {showCreate && (
        <CreateGroupForm
          onSaved={() => { setShowCreate(false); setRefreshKey((k) => k + 1); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noGroups")}</p>
          <p className="mt-1 text-xs text-muted">{t("noGroupsHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.publicId} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{g.name}</h3>
                  {g.nameNe && <p className="text-sm text-muted font-nepali">{g.nameNe}</p>}
                </div>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {g.type}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {t("members")}: {g._count.members}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleDelete(g)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  {tc("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/notifications/groups", {
        method: "POST",
        body: JSON.stringify({ name, nameNe: nameNe || undefined, type: "custom" }),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ClientApiError) setError(err.message);
      else setError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md rounded-lg border border-border bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-semibold text-foreground">{t("createGroup")}</h3>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t("groupName")}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t("groupName")} (NE)</label>
        <input
          value={nameNe}
          onChange={(e) => setNameNe(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-nepali"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "…" : tc("create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
