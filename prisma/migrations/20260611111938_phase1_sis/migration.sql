-- CreateEnum
CREATE TYPE "Stream" AS ENUM ('science', 'management', 'humanities', 'education');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('active', 'transferred', 'graduated', 'dropped');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('whatsapp', 'sms', 'viber', 'push');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('father', 'mother', 'grandfather', 'grandmother', 'uncle', 'aunt', 'brother', 'sister', 'other');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('active', 'on_leave', 'resigned');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('enrolled', 'promoted', 'transferred', 'graduated', 'dropped');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "stream" "Stream",
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "class_teacher_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "code" TEXT,
    "has_practical" BOOLEAN NOT NULL DEFAULT false,
    "full_marks_th" INTEGER NOT NULL DEFAULT 100,
    "pass_marks_th" INTEGER NOT NULL DEFAULT 35,
    "full_marks_pr" INTEGER,
    "pass_marks_pr" INTEGER,
    "credit_hours" DECIMAL(4,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "admission_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" TIMESTAMP(3),
    "photo_url" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "blood_group" TEXT,
    "rfid_uid" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'active',
    "admitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "preferred_channel" "Channel" NOT NULL DEFAULT 'whatsapp',
    "user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "student_id" BIGINT NOT NULL,
    "guardian_id" BIGINT NOT NULL,
    "relation" "GuardianRelation" NOT NULL DEFAULT 'other',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("student_id","guardian_id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "user_id" BIGINT,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "designation" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photo_url" TEXT,
    "joined_at" TIMESTAMP(3),
    "status" "StaffStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "section_id" BIGINT NOT NULL,
    "roll_no" INTEGER,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_public_id_key" ON "academic_years"("public_id");

-- CreateIndex
CREATE INDEX "academic_years_tenant_id_idx" ON "academic_years"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_name_key" ON "academic_years"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_public_id_key" ON "classes"("public_id");

-- CreateIndex
CREATE INDEX "classes_tenant_id_idx" ON "classes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_grade_level_stream_key" ON "classes"("tenant_id", "grade_level", "stream");

-- CreateIndex
CREATE UNIQUE INDEX "sections_public_id_key" ON "sections"("public_id");

-- CreateIndex
CREATE INDEX "sections_tenant_id_idx" ON "sections"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_tenant_id_class_id_name_key" ON "sections"("tenant_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_public_id_key" ON "subjects"("public_id");

-- CreateIndex
CREATE INDEX "subjects_tenant_id_idx" ON "subjects"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_class_id_name_key" ON "subjects"("tenant_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "students_public_id_key" ON "students"("public_id");

-- CreateIndex
CREATE INDEX "students_tenant_id_name_idx" ON "students"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "students_tenant_id_status_idx" ON "students"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_admission_no_key" ON "students"("tenant_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_rfid_uid_key" ON "students"("tenant_id", "rfid_uid");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_public_id_key" ON "guardians"("public_id");

-- CreateIndex
CREATE INDEX "guardians_tenant_id_phone_idx" ON "guardians"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "guardians_tenant_id_idx" ON "guardians"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_public_id_key" ON "staff"("public_id");

-- CreateIndex
CREATE INDEX "staff_tenant_id_idx" ON "staff"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_public_id_key" ON "enrollments"("public_id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_section_id_academic_year_id_idx" ON "enrollments"("tenant_id", "section_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_academic_year_id_key" ON "enrollments"("student_id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
