"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Slot = {
  publicId: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  room: string | null;
  subject: { publicId: string; name: string; nameNe: string | null; code: string | null } | null;
  staff: { publicId: string; name: string; nameNe: string | null } | null;
  section: { publicId: string; name: string; class: { publicId: string; name: string } } | null;
};

type Section = {
  publicId: string;
  name: string;
  class: { publicId: string; name: string };
};

type Staff = { publicId: string; name: string };

// Nepal week: Sun(0)–Fri(5), Saturday is off
const DAYS = [0, 1, 2, 3, 4, 5];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri"];

export default function TimetablePage() {
  const t = useTranslations("timetable");
  const tc = useTranslations("common");
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"section" | "teacher">("section");

  useEffect(() => {
    Promise.all([
      api<Section[]>("/api/sections?pageSize=100").then((r) => {
        setSections(r.data);
        if (r.data.length > 0) setSelectedSection(r.data[0].publicId);
      }),
      api<Staff[]>("/api/staff?pageSize=100").then((r) => setStaffList(r.data)),
    ]).catch(() => {});
  }, []);

  const loadSlots = useCallback(() => {
    if (viewMode === "section" && !selectedSection) return;
    if (viewMode === "teacher" && !selectedStaff) return;
    setLoading(true);
    const q = viewMode === "section" ? `section=${selectedSection}` : `staff=${selectedStaff}`;
    api<Slot[]>(`/api/timetable?${q}`)
      .then((r) => setSlots(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [viewMode, selectedSection, selectedStaff]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Build grid: rows=period numbers, cols=days
  const periods = [...new Set(slots.map((s) => s.periodNumber))].sort((a, b) => a - b);
  // Fallback periods if empty
  const displayPeriods = periods.length > 0 ? periods : [1, 2, 3, 4, 5, 6, 7, 8];

  function getSlot(day: number, period: number): Slot | undefined {
    return slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);
  }

  const slotColors: Record<string, string> = {
    class_period: "bg-surface border-border",
    break_time: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
    assembly: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
    lab: "bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      </div>

      {/* View mode + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border">
          <button
            onClick={() => setViewMode("section")}
            className={`px-3 py-1.5 text-sm font-medium ${viewMode === "section" ? "bg-brand-600 text-white" : "text-muted hover:text-foreground"} rounded-l-lg`}
          >
            {t("bySection")}
          </button>
          <button
            onClick={() => setViewMode("teacher")}
            className={`px-3 py-1.5 text-sm font-medium ${viewMode === "teacher" ? "bg-brand-600 text-white" : "text-muted hover:text-foreground"} rounded-r-lg`}
          >
            {t("byTeacher")}
          </button>
        </div>

        {viewMode === "section" ? (
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          >
            {sections.map((s) => (
              <option key={s.publicId} value={s.publicId}>
                {s.class.name} — {s.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          >
            <option value="">{t("selectTeacher")}</option>
            {staffList.map((s) => (
              <option key={s.publicId} value={s.publicId}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Timetable grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="border-b border-border px-3 py-2 text-left font-medium text-muted w-16">{t("period")}</th>
                <th className="border-b border-border px-3 py-2 text-left font-medium text-muted w-16">{t("time")}</th>
                {DAYS.map((d, i) => (
                  <th key={d} className="border-b border-l border-border px-3 py-2 text-center font-medium text-muted">
                    {t(DAY_KEYS[i])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayPeriods.map((period) => {
                const anySlot = slots.find((s) => s.periodNumber === period);
                return (
                  <tr key={period} className="hover:bg-muted/10">
                    <td className="border-b border-border px-3 py-2 text-center font-medium text-muted">{period}</td>
                    <td className="border-b border-border px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {anySlot ? `${anySlot.startTime}–${anySlot.endTime}` : ""}
                    </td>
                    {DAYS.map((day) => {
                      const slot = getSlot(day, period);
                      if (!slot) {
                        return <td key={day} className="border-b border-l border-border px-2 py-2 text-center text-xs text-muted">—</td>;
                      }
                      const colors = slotColors[slot.slotType] ?? slotColors.class_period;
                      return (
                        <td key={day} className={`border-b border-l border-border px-2 py-1.5 ${colors}`}>
                          <div className="min-h-[3rem] flex flex-col justify-center">
                            {slot.slotType === "break_time" ? (
                              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{t("break")}</span>
                            ) : slot.slotType === "assembly" ? (
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{t("assembly")}</span>
                            ) : (
                              <>
                                <span className="text-sm font-medium text-foreground truncate">
                                  {slot.subject?.code ?? slot.subject?.name ?? "—"}
                                </span>
                                {viewMode === "section" && slot.staff && (
                                  <span className="text-xs text-muted truncate">{slot.staff.name}</span>
                                )}
                                {viewMode === "teacher" && slot.section && (
                                  <span className="text-xs text-muted truncate">{slot.section.class.name} {slot.section.name}</span>
                                )}
                                {slot.room && <span className="text-xs text-muted">{slot.room}</span>}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && slots.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("noSlots")}</p>
          <p className="mt-1 text-xs text-muted">{t("noSlotsHint")}</p>
        </div>
      )}
    </div>
  );
}
