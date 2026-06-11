export type AttendanceStatus = "present" | "absent" | "late" | "leave";

export type RosterItem = {
  student: {
    publicId: string;
    name: string;
    nameNe?: string | null;
    photoUrl?: string | null;
    rollNo?: number | null;
  };
  record: {
    status: AttendanceStatus;
    source: "manual" | "rfid" | "system";
    firstTapAt?: string | null;
    lastTapAt?: string | null;
    markedBy?: string | null;
    note?: string | null;
  } | null;
};

export type RosterResponse = {
  section: { publicId: string; name: string; className: string };
  date: string;
  roster: RosterItem[];
};

export type AbsenceRun = {
  publicId: string;
  date: string;
  status: "completed" | "held" | "skipped";
  heldReason?: string | null;
  absentCount: number;
  presentCount: number;
  eventsEmitted: number;
  createdAt: string;
};
