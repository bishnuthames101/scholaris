-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('class', 'break', 'assembly', 'lab');

-- CreateTable
CREATE TABLE "subject_teachers" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "section_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "section_id" BIGINT NOT NULL,
    "subject_id" BIGINT,
    "staff_id" BIGINT,
    "day_of_week" INTEGER NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_type" "SlotType" NOT NULL DEFAULT 'class',
    "room" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitutions" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "timetable_slot_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "substitute_staff_id" BIGINT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "author_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "title_ne" TEXT,
    "body" TEXT NOT NULL,
    "body_ne" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "audience" TEXT NOT NULL DEFAULT 'all',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "notice_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("notice_id","user_id")
);

-- CreateTable
CREATE TABLE "homework" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "section_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "title_ne" TEXT,
    "description" TEXT,
    "description_ne" TEXT,
    "due_date" DATE NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "homework_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "content" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" TEXT,
    "comment" TEXT,
    "commented_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_teachers_public_id_key" ON "subject_teachers"("public_id");

-- CreateIndex
CREATE INDEX "subject_teachers_tenant_id_staff_id_idx" ON "subject_teachers"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_teachers_tenant_id_subject_id_section_id_key" ON "subject_teachers"("tenant_id", "subject_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_public_id_key" ON "timetable_slots"("public_id");

-- CreateIndex
CREATE INDEX "timetable_slots_tenant_id_staff_id_day_of_week_idx" ON "timetable_slots"("tenant_id", "staff_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_tenant_id_section_id_academic_year_id_day_o_key" ON "timetable_slots"("tenant_id", "section_id", "academic_year_id", "day_of_week", "period_number");

-- CreateIndex
CREATE UNIQUE INDEX "substitutions_public_id_key" ON "substitutions"("public_id");

-- CreateIndex
CREATE INDEX "substitutions_tenant_id_date_idx" ON "substitutions"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "substitutions_timetable_slot_id_date_key" ON "substitutions"("timetable_slot_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notices_public_id_key" ON "notices"("public_id");

-- CreateIndex
CREATE INDEX "notices_tenant_id_published_at_idx" ON "notices"("tenant_id", "published_at");

-- CreateIndex
CREATE INDEX "notices_tenant_id_audience_idx" ON "notices"("tenant_id", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "homework_public_id_key" ON "homework"("public_id");

-- CreateIndex
CREATE INDEX "homework_tenant_id_section_id_due_date_idx" ON "homework"("tenant_id", "section_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_public_id_key" ON "homework_submissions"("public_id");

-- CreateIndex
CREATE INDEX "homework_submissions_tenant_id_student_id_idx" ON "homework_submissions"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homework_id_student_id_key" ON "homework_submissions"("homework_id", "student_id");

-- AddForeignKey
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_timetable_slot_id_fkey" FOREIGN KEY ("timetable_slot_id") REFERENCES "timetable_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_substitute_staff_id_fkey" FOREIGN KEY ("substitute_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
