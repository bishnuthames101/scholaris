"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquareDot } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Settings = {
  messagingMode: "off" | "absence_only" | "per_tap";
  absenceCutoff: string;
};

/** Per-school attendance messaging mode + absence cutoff (§7.6) — live settings, no redeploy. */
export function AttendanceSettingsCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Settings>("/api/settings/attendance")
      .then((r) => {
        if (!cancelled) setSettings(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tc("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [tc]);

  function update(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
    setSavedFlash(false);
  }

  async function onSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api<Settings>("/api/settings/attendance", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(r.data);
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquareDot className="size-4.5 text-brand-600" />
          <CardTitle>{t("attendanceMessaging")}</CardTitle>
        </div>
        <CardDescription className="mt-1">{t("attendanceMessagingHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {!settings ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("messagingMode")} hint={t("messagingModeHint")}>
                <Select
                  value={settings.messagingMode}
                  onChange={(e) => update({ messagingMode: e.target.value as Settings["messagingMode"] })}
                >
                  <option value="absence_only">{t("modeAbsenceOnly")}</option>
                  <option value="per_tap">{t("modePerTap")}</option>
                  <option value="off">{t("modeOff")}</option>
                </Select>
              </Field>
              <Field label={t("absenceCutoff")} hint={t("absenceCutoffHint")}>
                <Input
                  type="time"
                  value={settings.absenceCutoff}
                  onChange={(e) => update({ absenceCutoff: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-3">
              {savedFlash && <span className="text-sm text-success">{t("settingsSaved")}</span>}
              <Button onClick={onSave} loading={saving} disabled={!dirty}>
                {tc("save")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
