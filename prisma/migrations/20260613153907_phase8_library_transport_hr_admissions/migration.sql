-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('available', 'issued', 'lost', 'damaged', 'withdrawn');

-- CreateEnum
CREATE TYPE "BorrowerType" AS ENUM ('student', 'staff');

-- CreateEnum
CREATE TYPE "LibraryIssueStatus" AS ENUM ('issued', 'returned', 'lost');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('present', 'absent', 'late', 'leave', 'half_day');

-- CreateEnum
CREATE TYPE "StaffAttendanceSource" AS ENUM ('manual', 'rfid');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('casual', 'sick', 'maternity', 'paternity', 'unpaid', 'other');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('draft', 'approved', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('walk_in', 'phone', 'website', 'referral', 'social_media', 'other');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('new', 'contacted', 'visit_scheduled', 'visited', 'application_sent', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'enrolled', 'withdrawn');

-- CreateTable
CREATE TABLE "library_books" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "accession_no" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "title_ne" TEXT,
    "author" TEXT,
    "author_ne" TEXT,
    "publisher" TEXT,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "edition" TEXT,
    "pages" INTEGER,
    "price_paisa" INTEGER,
    "shelf_location" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "available_copies" INTEGER NOT NULL DEFAULT 1,
    "status" "BookStatus" NOT NULL DEFAULT 'available',
    "acquired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_issues" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "book_id" BIGINT NOT NULL,
    "borrower_type" "BorrowerType" NOT NULL,
    "student_id" BIGINT,
    "staff_id" BIGINT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "fine_paisa" INTEGER NOT NULL DEFAULT 0,
    "fine_collected" BOOLEAN NOT NULL DEFAULT false,
    "status" "LibraryIssueStatus" NOT NULL DEFAULT 'issued',
    "issued_by" TEXT,
    "returned_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "vehicle_no" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_stops" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "route_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "pickup_time" TEXT,
    "drop_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_assignments" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "route_id" BIGINT NOT NULL,
    "stop_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "monthly_fee_paisa" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL,
    "source" "StaffAttendanceSource" NOT NULL DEFAULT 'manual',
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "marked_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "basic_paisa" INTEGER NOT NULL,
    "allowances_paisa" INTEGER NOT NULL DEFAULT 0,
    "deductions_paisa" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "bs_year" INTEGER NOT NULL,
    "bs_month" INTEGER NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'draft',
    "total_gross" INTEGER NOT NULL,
    "total_deduct" INTEGER NOT NULL,
    "total_net" INTEGER NOT NULL,
    "staff_count" INTEGER NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_slips" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "payroll_id" BIGINT NOT NULL,
    "staff_id" BIGINT NOT NULL,
    "basic_paisa" INTEGER NOT NULL,
    "allowances_paisa" INTEGER NOT NULL,
    "deductions_paisa" INTEGER NOT NULL,
    "net_paisa" INTEGER NOT NULL,
    "present_days" INTEGER NOT NULL,
    "absent_days" INTEGER NOT NULL,
    "leave_days" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "student_name" TEXT NOT NULL,
    "student_name_ne" TEXT,
    "gender" "Gender",
    "dob" TIMESTAMP(3),
    "applying_for_class_id" BIGINT,
    "guardian_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "guardian_email" TEXT,
    "address" TEXT,
    "source" "EnquirySource" NOT NULL DEFAULT 'walk_in',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'new',
    "assigned_to" TEXT,
    "note" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "enquiry_id" BIGINT NOT NULL,
    "note" TEXT NOT NULL,
    "contacted_via" TEXT,
    "next_follow_up" DATE,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "application_no" TEXT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "enquiry_id" BIGINT,
    "student_name" TEXT NOT NULL,
    "student_name_ne" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" TIMESTAMP(3),
    "address" TEXT,
    "phone" TEXT,
    "previous_school" TEXT,
    "applying_for_class_id" BIGINT NOT NULL,
    "applying_for_section_id" BIGINT,
    "guardian_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "guardian_email" TEXT,
    "guardian_relation" "GuardianRelation",
    "documents" JSONB NOT NULL DEFAULT '[]',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'draft',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "enrolled_student_id" BIGINT,
    "fee_paisa" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_books_public_id_key" ON "library_books"("public_id");

-- CreateIndex
CREATE INDEX "library_books_tenant_id_title_idx" ON "library_books"("tenant_id", "title");

-- CreateIndex
CREATE INDEX "library_books_tenant_id_category_idx" ON "library_books"("tenant_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_tenant_id_accession_no_key" ON "library_books"("tenant_id", "accession_no");

-- CreateIndex
CREATE UNIQUE INDEX "library_issues_public_id_key" ON "library_issues"("public_id");

-- CreateIndex
CREATE INDEX "library_issues_tenant_id_book_id_idx" ON "library_issues"("tenant_id", "book_id");

-- CreateIndex
CREATE INDEX "library_issues_tenant_id_student_id_idx" ON "library_issues"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "library_issues_tenant_id_staff_id_idx" ON "library_issues"("tenant_id", "staff_id");

-- CreateIndex
CREATE INDEX "library_issues_tenant_id_status_due_at_idx" ON "library_issues"("tenant_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "transport_routes_public_id_key" ON "transport_routes"("public_id");

-- CreateIndex
CREATE INDEX "transport_routes_tenant_id_idx" ON "transport_routes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_routes_tenant_id_name_key" ON "transport_routes"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_stops_public_id_key" ON "transport_stops"("public_id");

-- CreateIndex
CREATE INDEX "transport_stops_tenant_id_route_id_idx" ON "transport_stops"("tenant_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_stops_tenant_id_route_id_name_key" ON "transport_stops"("tenant_id", "route_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_assignments_public_id_key" ON "transport_assignments"("public_id");

-- CreateIndex
CREATE INDEX "transport_assignments_tenant_id_route_id_idx" ON "transport_assignments"("tenant_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_assignments_tenant_id_student_id_academic_year_id_key" ON "transport_assignments"("tenant_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_public_id_key" ON "staff_attendance"("public_id");

-- CreateIndex
CREATE INDEX "staff_attendance_tenant_id_date_idx" ON "staff_attendance"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_tenant_id_staff_id_date_key" ON "staff_attendance"("tenant_id", "staff_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_public_id_key" ON "leave_requests"("public_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_staff_id_idx" ON "leave_requests"("tenant_id", "staff_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_status_idx" ON "leave_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_public_id_key" ON "salary_structures"("public_id");

-- CreateIndex
CREATE INDEX "salary_structures_tenant_id_staff_id_idx" ON "salary_structures"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_public_id_key" ON "payrolls"("public_id");

-- CreateIndex
CREATE INDEX "payrolls_tenant_id_fiscal_year_idx" ON "payrolls"("tenant_id", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_tenant_id_bs_year_bs_month_key" ON "payrolls"("tenant_id", "bs_year", "bs_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_slips_public_id_key" ON "payroll_slips"("public_id");

-- CreateIndex
CREATE INDEX "payroll_slips_tenant_id_staff_id_idx" ON "payroll_slips"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_slips_payroll_id_staff_id_key" ON "payroll_slips"("payroll_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_public_id_key" ON "enquiries"("public_id");

-- CreateIndex
CREATE INDEX "enquiries_tenant_id_status_idx" ON "enquiries"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "enquiries_tenant_id_academic_year_id_idx" ON "enquiries"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "enquiries_tenant_id_guardian_phone_idx" ON "enquiries"("tenant_id", "guardian_phone");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_follow_ups_public_id_key" ON "enquiry_follow_ups"("public_id");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_tenant_id_enquiry_id_idx" ON "enquiry_follow_ups"("tenant_id", "enquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_public_id_key" ON "admission_applications"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_enquiry_id_key" ON "admission_applications"("enquiry_id");

-- CreateIndex
CREATE INDEX "admission_applications_tenant_id_academic_year_id_status_idx" ON "admission_applications"("tenant_id", "academic_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_tenant_id_application_no_key" ON "admission_applications"("tenant_id", "application_no");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_tenant_id_fiscal_year_seq_key" ON "admission_applications"("tenant_id", "fiscal_year", "seq");

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transport_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_applying_for_class_id_fkey" FOREIGN KEY ("applying_for_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_applying_for_class_id_fkey" FOREIGN KEY ("applying_for_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_applying_for_section_id_fkey" FOREIGN KEY ("applying_for_section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
