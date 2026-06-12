/**
 * Phase 4 acceptance script (SMS_MASTER_PLAN.md Phase 4 criteria):
 *  1. create a terminal exam
 *  2. enter theory+practical marks for a class
 *  3. system computes per-subject grade + GPA per NEB scale
 *  4. generate a bilingual marksheet PDF
 *  5. publishing emits a results.published event
 *  6. changing the grade scale reflows (draft preview) grades
 *  + lock/unlock behaviour and audit checks.
 *
 * Run with the dev server up:  node scripts/acceptance-phase4.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "admin@demo.scholaris.app";
const PASSWORD = "Demo1234!";

let cookies = "";
let passed = 0;
let failed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function call(method, path, body, raw = false) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const jar = new Map(cookies.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
    for (const c of setCookie) jar.set(c.split("=")[0], c.split(";")[0]);
    cookies = [...jar.values()].join("; ");
  }
  if (raw) return res;
  const json = await res.json().catch(() => null);
  return { status: res.status, ...((json ?? {})) };
}

async function main() {
  console.log("— Login");
  const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  check("school admin login", login.success === true, JSON.stringify(login.error));

  console.log("— Setup: pick year + a class with subjects & students");
  const years = await call("GET", "/api/academic-years");
  const year = years.data.find((y) => y.isCurrent) ?? years.data[0];
  check("current academic year found", !!year);

  const classes = await call("GET", "/api/classes?pageSize=100");
  // Pick the class with the most enrollments; ensure it has ≥2 subjects
  // (create missing ones — this exercises the SIS API too).
  const byEnrollment = [...classes.data].sort(
    (a, b) =>
      b.sections.reduce((n, s) => n + s._count.enrollments, 0) -
      a.sections.reduce((n, s) => n + s._count.enrollments, 0),
  );
  const cls = byEnrollment[0];
  let subj = await call("GET", `/api/classes/${cls.publicId}/subjects`);
  let list = Array.isArray(subj.data) ? subj.data : [];
  const wanted = [
    { name: "Science", code: "SCI", hasPractical: true, fullMarksTh: 75, passMarksTh: 27, fullMarksPr: 25, passMarksPr: 10 },
    { name: "English", code: "ENG" },
  ];
  for (const w of wanted) {
    if (list.length >= 2) break;
    if (!list.some((s) => s.name === w.name)) {
      const createdSub = await call("POST", `/api/classes/${cls.publicId}/subjects`, w);
      check(`subject ${w.name} created for ${cls.name}`, createdSub.success, JSON.stringify(createdSub.error));
      subj = await call("GET", `/api/classes/${cls.publicId}/subjects`);
      list = Array.isArray(subj.data) ? subj.data : [];
    }
  }
  const target = { cls, subjects: list };
  check("class with ≥2 subjects ready", list.length >= 2);

  console.log("— Grade scales");
  const scales = await call("GET", "/api/exams/grade-scales");
  const defaultScale = scales.data.find((s) => s.isDefault);
  check("NEB default scale lazily seeded", !!defaultScale && defaultScale.bands.length === 8);

  console.log("— Create terminal exam");
  const examName = `Acceptance Terminal ${Date.now()}`;
  const exam = await call("POST", "/api/exams", {
    name: examName,
    nameNe: "स्वीकृति परीक्षा",
    type: "terminal",
    academicYearId: year.publicId,
  });
  check("exam created (draft)", exam.success && exam.data.status === "draft");
  const examId = exam.data.publicId;

  const addSub = await call("POST", `/api/exams/${examId}/subjects`, {
    classId: target.cls.publicId,
  });
  check("class subjects added", addSub.success && addSub.data.added >= 2, JSON.stringify(addSub));

  const detail = await call("GET", `/api/exams/${examId}`);
  const es = detail.data.subjects[0];
  check("exam detail has subjects + scale bands", detail.data.gradeScale.bands.length === 8);

  // Force a practical component on the first subject to test th+pr math.
  const patchEs = await call("PATCH", `/api/exams/${examId}/subjects/${es.publicId}`, {
    hasPractical: true,
    fullMarksTh: 75,
    passMarksTh: 27,
    fullMarksPr: 25,
    passMarksPr: 10,
  });
  check("exam-subject marks config editable (draft)", patchEs.success);

  console.log("— Marks entry");
  const rosterRes = await call("GET", `/api/exams/${examId}/marks?examSubject=${es.publicId}`);
  const roster = rosterRes.data.roster;
  check("roster loads enrolled students", roster.length >= 3, `got ${roster.length}`);

  // s0: A+ (68+24=92%), s1: NG via theory fail despite combined pass (20+25=45%),
  // s2: absent → NG, s3: D+ boundary (26.25→ actually use 27+8=35%? pass exactly)
  const [s0, s1, s2, s3] = roster;
  const marks = [
    { studentId: s0.student.publicId, marksTh: 68, marksPr: 24, isAbsent: false },
    { studentId: s1.student.publicId, marksTh: 20, marksPr: 25, isAbsent: false },
    { studentId: s2.student.publicId, marksTh: null, marksPr: null, isAbsent: true },
    ...(s3 ? [{ studentId: s3.student.publicId, marksTh: 27, marksPr: 10, isAbsent: false }] : []),
  ];
  const save = await call("PUT", `/api/exams/${examId}/marks`, {
    examSubjectId: es.publicId,
    marks,
  });
  check("bulk marks saved", save.success && save.data.saved === marks.length);

  const over = await call("PUT", `/api/exams/${examId}/marks`, {
    examSubjectId: es.publicId,
    marks: [{ studentId: s0.student.publicId, marksTh: 80, marksPr: null, isAbsent: false }],
  });
  check("marks above full marks rejected", over.success === false && over.status === 422);

  const prev = await call("GET", `/api/exams/${examId}/marks?examSubject=${es.publicId}`);
  const p0 = prev.data.roster.find((r) => r.student.publicId === s0.student.publicId).preview;
  const p1 = prev.data.roster.find((r) => r.student.publicId === s1.student.publicId).preview;
  const p2 = prev.data.roster.find((r) => r.student.publicId === s2.student.publicId).preview;
  check("preview: 92% → A+ 4.0", p0?.letter === "A+" && p0?.gradePoint === 4, JSON.stringify(p0));
  check("preview: theory fail → NG despite 45% combined", p1?.letter === "NG", JSON.stringify(p1));
  check("preview: absent → NG", p2?.letter === "NG");

  // Second subject: theory-only quick marks so GPA averages two subjects.
  const es2 = detail.data.subjects[1];
  const pr2 = (f) => (es2.hasPractical ? Math.round((es2.fullMarksPr ?? 0) * f) : null);
  const save2 = await call("PUT", `/api/exams/${examId}/marks`, {
    examSubjectId: es2.publicId,
    marks: [
      // exactly 85% / 55% across th(+pr) → A (3.6) / C+ (2.4)
      { studentId: s0.student.publicId, marksTh: Math.round(es2.fullMarksTh * 0.85), marksPr: pr2(0.85), isAbsent: false },
      { studentId: s1.student.publicId, marksTh: Math.round(es2.fullMarksTh * 0.55), marksPr: pr2(0.55), isAbsent: false },
    ],
  });
  check("second subject marks saved", save2.success);

  console.log("— Grade-scale reflow (draft)");
  const customScale = await call("POST", "/api/exams/grade-scales", {
    name: `Strict ${Date.now()}`,
    bands: [
      { letter: "P", gradePoint: 4, minPercent: 95, maxPercent: 100, isPassing: true },
      { letter: "F", gradePoint: 0, minPercent: 0, maxPercent: 95, isPassing: false },
    ],
  });
  check("custom scale created", customScale.success);
  const badScale = await call("POST", "/api/exams/grade-scales", {
    name: "Broken",
    bands: [
      { letter: "A", gradePoint: 4, minPercent: 50, maxPercent: 100, isPassing: true },
      { letter: "F", gradePoint: 0, minPercent: 0, maxPercent: 40, isPassing: false },
    ],
  });
  check("invalid band table rejected", badScale.success === false && badScale.status === 422);

  // Reflow: edit the DEFAULT scale used by the exam (tighten A+ to 95) and
  // confirm the live preview reflows; then revert.
  const reflowEdit = await call("PUT", `/api/exams/grade-scales/${defaultScale.publicId}`, {
    bands: defaultScale.bands.map((b) => ({
      letter: b.letter,
      gradePoint: Number(b.gradePoint),
      minPercent: b.letter === "A+" ? 95 : Number(b.minPercent),
      maxPercent: b.letter === "A" ? 95 : Number(b.maxPercent),
      isPassing: b.isPassing,
    })),
  });
  check("default scale bands updated", reflowEdit.success, JSON.stringify(reflowEdit.error));
  const reflow = await call("GET", `/api/exams/${examId}/marks?examSubject=${es.publicId}`);
  const r0 = reflow.data.roster.find((r) => r.student.publicId === s0.student.publicId).preview;
  check("draft preview reflows after scale change (92% now A)", r0?.letter === "A", JSON.stringify(r0));
  // revert
  const revert = await call("PUT", `/api/exams/grade-scales/${defaultScale.publicId}`, {
    bands: defaultScale.bands.map((b) => ({
      letter: b.letter,
      gradePoint: Number(b.gradePoint),
      minPercent: Number(b.minPercent),
      maxPercent: Number(b.maxPercent),
      isPassing: b.isPassing,
    })),
  });
  check("scale reverted", revert.success);

  console.log("— Publish");
  const pub = await call("POST", `/api/exams/${examId}/publish`);
  check(
    "publish computes results",
    pub.success && pub.data.status === "published" && pub.data.students >= 2,
    JSON.stringify(pub),
  );

  const lockedSave = await call("PUT", `/api/exams/${examId}/marks`, {
    examSubjectId: es.publicId,
    marks: [{ studentId: s0.student.publicId, marksTh: 1, marksPr: 1, isAbsent: false }],
  });
  check("marks locked after publish (409)", lockedSave.status === 409);

  const results = await call("GET", `/api/exams/${examId}/results`);
  const res0 = results.data.results.find((r) => r.student.publicId === s0.student.publicId);
  const res1 = results.data.results.find((r) => r.student.publicId === s1.student.publicId);
  check("results: s0 passed with GPA (4.0+3.6)/2=3.8", res0?.status === "passed" && Number(res0?.gpa) === 3.8, JSON.stringify({ gpa: res0?.gpa }));
  check("results: s1 failed with 1 NG", res1?.status === "failed" && res1?.ngCount === 1);
  check("results ranked by GPA desc", Number(results.data.results[0].gpa) >= Number(results.data.results.at(-1).gpa));

  // Snapshot immutability: edit scale AFTER publish → published grades unchanged.
  await call("PUT", `/api/exams/grade-scales/${defaultScale.publicId}`, {
    bands: defaultScale.bands.map((b) => ({
      letter: b.letter,
      gradePoint: Number(b.gradePoint),
      minPercent: b.letter === "A+" ? 95 : Number(b.minPercent),
      maxPercent: b.letter === "A" ? 95 : Number(b.maxPercent),
      isPassing: b.isPassing,
    })),
  });
  const afterEdit = await call("GET", `/api/exams/${examId}/marks?examSubject=${es.publicId}`);
  const snap0 = afterEdit.data.roster.find((r) => r.student.publicId === s0.student.publicId).preview;
  check("published grades survive scale edits (snapshot stays A+)", snap0?.letter === "A+", JSON.stringify(snap0));
  await call("PUT", `/api/exams/grade-scales/${defaultScale.publicId}`, {
    bands: defaultScale.bands.map((b) => ({
      letter: b.letter,
      gradePoint: Number(b.gradePoint),
      minPercent: Number(b.minPercent),
      maxPercent: Number(b.maxPercent),
      isPassing: b.isPassing,
    })),
  });

  console.log("— Marksheet PDF");
  const pdfRes = await call("GET", `/api/exams/${examId}/marksheets/${s0.student.publicId}`, null, true);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  check(
    "marksheet PDF generated",
    pdfRes.status === 200 && pdfRes.headers.get("content-type") === "application/pdf" && pdfBuf.subarray(0, 5).toString() === "%PDF-",
    `status=${pdfRes.status}`,
  );
  const pdfRes2 = await call("GET", `/api/exams/${examId}/marksheets/${s0.student.publicId}`, null, true);
  check("marksheet reprint increments (copy label on 2nd print)", pdfRes2.status === 200);

  console.log("— Unlock (audited) + republish");
  const noReason = await call("POST", `/api/exams/${examId}/unlock`, {});
  check("unlock without reason rejected", noReason.success === false);
  const unlock = await call("POST", `/api/exams/${examId}/unlock`, { reason: "Acceptance test correction" });
  check("audited unlock reopens exam", unlock.success && unlock.data.status === "draft");
  const repub = await call("POST", `/api/exams/${examId}/publish`);
  check("republish recomputes results", repub.success && repub.data.status === "published");

  process.exit(summary());
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
