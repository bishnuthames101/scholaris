"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Nfc, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type DeviceRow = {
  publicId: string;
  deviceId: string;
  name: string;
  location: "gate" | "classroom" | "bus";
  isActive: boolean;
  lastSeenAt?: string | null;
  lastReportedAt?: string | null;
  reportedToday: boolean;
};

/** RFID reader management — register devices, see liveness, rotate secrets. */
export function RfidDevicesCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  // add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState<DeviceRow["location"]>("gate");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // one-time secret reveal
  const [secretInfo, setSecretInfo] = useState<{ deviceId: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<DeviceRow[]>("/api/rfid/devices")
      .then((r) => {
        if (cancelled) return;
        setDevices(r.data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tc("error"));
        setDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, tc]);

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const r = await api<DeviceRow & { secret: string }>("/api/rfid/devices", {
        method: "POST",
        body: JSON.stringify({ deviceId: deviceId.trim(), name: name.trim(), location }),
      });
      setAddOpen(false);
      setDeviceId("");
      setName("");
      setLocation("gate");
      setSecretInfo({ deviceId: r.data.deviceId, secret: r.data.secret });
      setCopied(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function onRotate(d: DeviceRow) {
    setBusyId(d.publicId);
    try {
      const r = await api<{ deviceId: string; secret: string }>(
        `/api/rfid/devices/${d.publicId}/rotate-secret`,
        { method: "POST" },
      );
      setSecretInfo({ deviceId: r.data.deviceId, secret: r.data.secret });
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(d: DeviceRow) {
    if (!window.confirm(t("deleteDeviceConfirm", { name: d.name }))) return;
    setBusyId(d.publicId);
    try {
      await api(`/api/rfid/devices/${d.publicId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function copySecret() {
    if (!secretInfo) return;
    await navigator.clipboard.writeText(secretInfo.secret);
    setCopied(true);
  }

  const loading = devices === null;

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Nfc className="size-4.5 text-brand-600" />
            <CardTitle>{t("rfidDevices")}</CardTitle>
          </div>
          <CardDescription className="mt-1">{t("rfidDevicesHint")}</CardDescription>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          {t("addDevice")}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-brand-600" />
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Nfc className="size-8 text-muted" />
            <p className="font-medium text-foreground">{t("noDevices")}</p>
            <p className="max-w-sm text-sm text-muted">{t("noDevicesHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li
                key={d.publicId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {d.name}
                    <span className="font-mono text-xs text-muted">{d.deviceId}</span>
                    {!d.isActive ? (
                      <Badge tone="neutral">{t("deviceDisabled")}</Badge>
                    ) : d.reportedToday ? (
                      <Badge tone="success">{t("reportedToday")}</Badge>
                    ) : (
                      <Badge tone="warning">{t("notReportedToday")}</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {t(`location${d.location.charAt(0).toUpperCase()}${d.location.slice(1)}` as Parameters<typeof t>[0])}
                    {" · "}
                    {d.lastSeenAt
                      ? `${t("lastSeen")} ${new Date(d.lastSeenAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}`
                      : t("neverSeen")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busyId === d.publicId}
                    onClick={() => onRotate(d)}
                    title={t("rotateSecret")}
                  >
                    <KeyRound className="size-4" />
                    {t("rotateSecret")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(d)}
                    aria-label={tc("delete")}
                    className="text-muted hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Add device */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t("addDevice")}>
        <form onSubmit={onAdd} className="space-y-4">
          <Field label={t("deviceIdLabel")} hint={t("deviceIdHint")} required>
            <Input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="GATE-01"
              pattern="[A-Za-z0-9._-]+"
              required
            />
          </Field>
          <Field label={t("deviceName")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t("deviceLocation")}>
            <Select
              value={location}
              onChange={(e) => setLocation(e.target.value as DeviceRow["location"])}
            >
              <option value="gate">{t("locationGate")}</option>
              <option value="classroom">{t("locationClassroom")}</option>
              <option value="bus">{t("locationBus")}</option>
            </Select>
          </Field>
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

      {/* One-time secret reveal */}
      <Dialog
        open={secretInfo !== null}
        onClose={() => setSecretInfo(null)}
        title={t("deviceSecret")}
      >
        {secretInfo && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {t("deviceSecretHint", { deviceId: secretInfo.deviceId })}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-surface-muted px-3 py-2 font-mono text-xs text-foreground">
                {secretInfo.secret}
              </code>
              <Button size="sm" variant="outline" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setSecretInfo(null)}>{t("secretStored")}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
