"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import type { ClassOption } from "./types";

type GuardianForm = {
  name: string;
  phone: string;
  relation: string;
  isPrimary: boolean;
};

const RELATIONS = [
  "father",
  "mother",
  "grandfather",
  "grandmother",
  "uncle",
  "aunt",
  "brother",
  "sister",
  "other",
] as const;

const emptyGuardian = (isPrimary: boolean): GuardianForm => ({
  name: "",
  phone: "",
  relation: "father",
  isPrimary,
});

export function AddStudentDialog({
  open,
  onClose,
  classes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  onCreated: () => void;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");

  const [admissionNo, setAdmissionNo] = useState("");
  const [name, setName] = useState("");
  const [nameNe, setNameNe] = useState("");
  const [gender, setGender] = useState("male");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [guardians, setGuardians] = useState<GuardianForm[]>([emptyGuardian(true)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((c) => c.publicId === classId),
    [classes, classId],
  );

  function reset() {
    setAdmissionNo("");
    setName("");
    setNameNe("");
    setGender("male");
    setDob("");
    setPhone("");
    setAddress("");
    setClassId("");
    setSectionId("");
    setRollNo("");
    setGuardians([emptyGuardian(true)]);
    setError(null);
  }

  function setGuardian(i: number, patch: Partial<GuardianForm>) {
    setGuardians((gs) =>
      gs.map((g, j) => {
        if (j !== i) return patch.isPrimary ? { ...g, isPrimary: false } : g;
        return { ...g, ...patch };
      }),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const validGuardians = guardians.filter((g) => g.name.trim() && g.phone.trim());
      await api("/api/students", {
        method: "POST",
        body: JSON.stringify({
          admissionNo: admissionNo.trim(),
          name: name.trim(),
          nameNe: nameNe.trim() || undefined,
          gender,
          dob: dob || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          sectionId: sectionId || undefined,
          rollNo: rollNo ? Number(rollNo) : undefined,
          guardians: validGuardians.length
            ? validGuardians.map((g) => ({
                name: g.name.trim(),
                phone: g.phone.trim(),
                relation: g.relation,
                isPrimary: g.isPrimary,
              }))
            : undefined,
        }),
      });
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("add")} className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admissionNo")} required>
            <Input
              value={admissionNo}
              onChange={(e) => setAdmissionNo(e.target.value)}
              required
            />
          </Field>
          <Field label={t("gender")} required>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="male">{t("male")}</option>
              <option value="female">{t("female")}</option>
              <option value="other">{t("other")}</option>
            </Select>
          </Field>
          <Field label={t("name")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label={t("nameNe")}>
            <Input value={nameNe} onChange={(e) => setNameNe(e.target.value)} lang="ne" />
          </Field>
          <Field label={t("dob")}>
            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label={t("phone")}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label={t("address")} className="sm:col-span-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 rounded-md bg-surface-muted/50 p-4 sm:grid-cols-3">
          <Field label={t("class")}>
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId("");
              }}
            >
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.publicId} value={c.publicId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("section")}>
            <Select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!selectedClass}
            >
              <option value="">—</option>
              {selectedClass?.sections.map((s) => (
                <option key={s.publicId} value={s.publicId}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("rollNo")}>
            <Input
              type="number"
              min={1}
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              disabled={!sectionId}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{t("guardians")}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setGuardians((gs) => [...gs, emptyGuardian(gs.length === 0)])}
            >
              <Plus className="size-4" />
              {t("addGuardian")}
            </Button>
          </div>
          {guardians.map((g, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
            >
              <Input
                placeholder={t("name")}
                value={g.name}
                onChange={(e) => setGuardian(i, { name: e.target.value })}
                aria-label={t("guardian")}
              />
              <Input
                placeholder={t("phone")}
                value={g.phone}
                onChange={(e) => setGuardian(i, { phone: e.target.value })}
                inputMode="tel"
              />
              <Select
                value={g.relation}
                onChange={(e) => setGuardian(i, { relation: e.target.value })}
                className="sm:w-36"
                aria-label={t("relation")}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`relation${r.charAt(0).toUpperCase()}${r.slice(1)}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="radio"
                  name="primary-guardian"
                  checked={g.isPrimary}
                  onChange={() => setGuardian(i, { isPrimary: true })}
                  className="accent-brand-600"
                />
                {t("primaryContact")}
              </label>
              <button
                type="button"
                onClick={() => setGuardians((gs) => gs.filter((_, j) => j !== i))}
                className="self-center rounded-md p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                aria-label={t("removeGuardian")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {tc("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
