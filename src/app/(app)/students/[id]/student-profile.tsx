"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Camera, Phone, Star } from "lucide-react";
import { api } from "@/lib/client-api";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { BsDate } from "@/components/bs-date";

type GuardianEntry = {
  relation: string;
  isPrimary: boolean;
  guardian: {
    publicId: string;
    name: string;
    phone: string;
    email?: string | null;
    preferredChannel?: string | null;
  };
};

type EnrollmentEntry = {
  publicId: string;
  rollNo?: number | null;
  status: string;
  academicYear: { publicId: string; name: string; isCurrent: boolean };
  section: {
    publicId: string;
    name: string;
    class: { publicId: string; name: string; gradeLevel: number };
  };
};

type StudentDetail = {
  publicId: string;
  admissionNo: string;
  name: string;
  nameNe?: string | null;
  gender: "male" | "female" | "other";
  status: "active" | "transferred" | "graduated" | "dropped";
  dob?: string | null;
  address?: string | null;
  phone?: string | null;
  bloodGroup?: string | null;
  rfidUid?: string | null;
  admittedAt?: string | null;
  photoUrl?: string | null;
  guardians: GuardianEntry[];
  enrollments: EnrollmentEntry[];
};

const statusTone = {
  active: "success",
  transferred: "info",
  graduated: "brand",
  dropped: "danger",
} as const;

export function StudentProfile({ id }: { id: string }) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const ts = useTranslations("settings");
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<{ photoUrl: string }>(`/api/students/${id}/photo`, {
        method: "POST",
        body: form,
      });
      setStudent((s) => (s ? { ...s, photoUrl: r.data.photoUrl } : s));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setPhotoBusy(false);
    }
  }

  useEffect(() => {
    api<StudentDetail>(`/api/students/${id}`)
      .then((r) => setStudent(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [id]);

  if (error) {
    return (
      <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }
  if (!student) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-6 text-brand-600" />
      </div>
    );
  }

  const facts: [string, React.ReactNode][] = [
    [t("admissionNo"), <span key="a" className="font-mono">{student.admissionNo}</span>],
    [t("gender"), t(student.gender)],
    [t("dob"), student.dob ? <BsDate key="d" date={new Date(student.dob)} /> : "—"],
    [t("phone"), student.phone ?? "—"],
    [t("address"), student.address ?? "—"],
    [t("bloodGroup"), student.bloodGroup ?? "—"],
    [t("rfid"), student.rfidUid ? <span key="r" className="font-mono">{student.rfidUid}</span> : "—"],
    [
      t("admittedOn"),
      student.admittedAt ? <BsDate key="ad" date={new Date(student.admittedAt)} /> : "—",
    ],
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/students"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tc("back")}
      </Link>

      <div className="flex flex-wrap items-center gap-5">
        <div className="group relative">
          <Avatar name={student.name} src={student.photoUrl} size="xl" />
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPhotoPicked}
          />
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={photoBusy}
            aria-label={t("uploadPhoto")}
            title={t("uploadPhoto")}
            className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-card transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
          >
            {photoBusy ? <Spinner className="size-4" /> : <Camera className="size-4" />}
          </button>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {student.name}
            </h1>
            <Badge tone={statusTone[student.status]}>
              {t(
                `status${student.status.charAt(0).toUpperCase()}${student.status.slice(1)}` as Parameters<typeof t>[0],
              )}
            </Badge>
          </div>
          {student.nameNe && <p className="mt-0.5 text-muted">{student.nameNe}</p>}
          {photoError && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {photoError}
            </p>
          )}
          {student.enrollments.find((e) => e.academicYear.isCurrent) && (
            <p className="mt-1 text-sm text-muted">
              {student.enrollments.find((e) => e.academicYear.isCurrent)!.section.class.name}
              {" · "}
              {student.enrollments.find((e) => e.academicYear.isCurrent)!.section.name}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("guardians")}</CardTitle>
            </CardHeader>
            <CardContent>
              {student.guardians.length === 0 ? (
                <p className="text-sm text-muted">{t("noGuardians")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {student.guardians.map((g) => (
                    <li key={g.guardian.publicId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Avatar name={g.guardian.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-medium text-foreground">
                          {g.guardian.name}
                          {g.isPrimary && (
                            <Star className="size-3.5 fill-warning text-warning" aria-label={t("primaryContact")} />
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {t(
                            `relation${g.relation.charAt(0).toUpperCase()}${g.relation.slice(1)}` as Parameters<typeof t>[0],
                          )}
                          {g.guardian.preferredChannel && ` · ${g.guardian.preferredChannel}`}
                        </p>
                      </div>
                      <a
                        href={`tel:${g.guardian.phone}`}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-brand-700 transition-colors hover:bg-brand-50"
                      >
                        <Phone className="size-4" />
                        {g.guardian.phone}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("enrollmentHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {student.enrollments.length === 0 ? (
                <p className="text-sm text-muted">{t("noSection")}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {student.enrollments.map((e) => (
                    <li key={e.publicId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-medium text-foreground">
                          {e.section.class.name} · {e.section.name}
                        </p>
                        <p className="text-xs text-muted">
                          {t("academicYear")}: {e.academicYear.name}
                          {e.rollNo != null && ` · ${t("rollNo")} ${e.rollNo}`}
                        </p>
                      </div>
                      {e.academicYear.isCurrent && <Badge tone="brand">{ts("current")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
