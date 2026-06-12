-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('unit', 'terminal', 'board');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ExamResultStatus" AS ENUM ('passed', 'failed');

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "grade_scale_id" BIGINT NOT NULL,
    "letter" TEXT NOT NULL,
    "letter_ne" TEXT,
    "grade_point" DECIMAL(3,2) NOT NULL,
    "min_percent" DECIMAL(5,2) NOT NULL,
    "max_percent" DECIMAL(5,2) NOT NULL,
    "is_passing" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "grade_scale_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "type" "ExamType" NOT NULL DEFAULT 'terminal',
    "status" "ExamStatus" NOT NULL DEFAULT 'draft',
    "starts_at" DATE,
    "ends_at" DATE,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "exam_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "has_practical" BOOLEAN NOT NULL DEFAULT false,
    "full_marks_th" INTEGER NOT NULL,
    "pass_marks_th" INTEGER NOT NULL,
    "full_marks_pr" INTEGER,
    "pass_marks_pr" INTEGER,
    "exam_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "exam_id" BIGINT NOT NULL,
    "exam_subject_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "marks_th" DECIMAL(6,2),
    "marks_pr" DECIMAL(6,2),
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "percent" DECIMAL(5,2),
    "grade_letter" TEXT,
    "grade_point" DECIMAL(3,2),
    "entered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "exam_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "gpa" DECIMAL(3,2) NOT NULL,
    "status" "ExamResultStatus" NOT NULL,
    "ng_count" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "print_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_scales_public_id_key" ON "grade_scales"("public_id");

-- CreateIndex
CREATE INDEX "grade_scales_tenant_id_idx" ON "grade_scales"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_scales_tenant_id_name_key" ON "grade_scales"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "grade_bands_tenant_id_idx" ON "grade_bands"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_scale_id_letter_key" ON "grade_bands"("grade_scale_id", "letter");

-- CreateIndex
CREATE UNIQUE INDEX "exams_public_id_key" ON "exams"("public_id");

-- CreateIndex
CREATE INDEX "exams_tenant_id_academic_year_id_idx" ON "exams"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_tenant_id_academic_year_id_name_key" ON "exams"("tenant_id", "academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_public_id_key" ON "exam_subjects"("public_id");

-- CreateIndex
CREATE INDEX "exam_subjects_tenant_id_exam_id_class_id_idx" ON "exam_subjects"("tenant_id", "exam_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_exam_id_subject_id_key" ON "exam_subjects"("exam_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "marks_public_id_key" ON "marks"("public_id");

-- CreateIndex
CREATE INDEX "marks_tenant_id_exam_id_student_id_idx" ON "marks"("tenant_id", "exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "marks_exam_subject_id_student_id_key" ON "marks"("exam_subject_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_public_id_key" ON "exam_results"("public_id");

-- CreateIndex
CREATE INDEX "exam_results_tenant_id_exam_id_idx" ON "exam_results"("tenant_id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_exam_id_student_id_key" ON "exam_results"("exam_id", "student_id");

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_exam_subject_id_fkey" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
