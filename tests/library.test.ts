import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { calculateFine } from "../src/lib/library/fine";
import { librarySettingsOf } from "../src/lib/library/settings";

/**
 * Phase 8A — Library tests.
 * Tests book CRUD, issue/return, fine calculation, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantId2: bigint;
let staffId: bigint;
let studentId: bigint;
let bookId: bigint;
let bookPublicId: string;
let issueId: bigint;
let issuePublicId: string;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "lib-test" },
        update: {},
        create: { name: "Library Test School", slug: "lib-test" },
      });
      tenantId = tenant.id;

      const tenant2 = await tx.tenant.upsert({
        where: { slug: "lib-test-2" },
        update: {},
        create: { name: "Library Test School 2", slug: "lib-test-2" },
      });
      tenantId2 = tenant2.id;

      // Clean up leftover data from prior runs
      await tx.libraryIssue.deleteMany({ where: { tenantId } });
      await tx.libraryIssue.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.libraryBook.deleteMany({ where: { tenantId } });
      await tx.libraryBook.deleteMany({ where: { tenantId: tenantId2 } });

      const cls =
        (await tx.schoolClass.findFirst({ where: { tenantId, name: "Lib Class" } })) ??
        (await tx.schoolClass.create({ data: { tenantId, gradeLevel: 3, name: "Lib Class" } }));

      const staff =
        (await tx.staff.findFirst({ where: { tenantId, email: "lib-test@test.example" } })) ??
        (await tx.staff.create({
          data: { tenantId, name: "Librarian", designation: "Librarian", email: "lib-test@test.example" },
        }));
      staffId = staff.id;

      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId, admissionNo: "LIB-001" } },
        update: {},
        create: {
          tenantId,
          name: "Lib Student",
          admissionNo: "LIB-001",
          gender: "male",
          dob: new Date("2015-01-01"),
        },
      });
      studentId = student.id;
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Fine calculation", () => {
  it("returns 0 for books returned on time", () => {
    const due = new Date("2026-06-10");
    const returned = new Date("2026-06-10");
    expect(calculateFine(due, returned, 500)).toBe(0);
  });

  it("calculates fine for overdue books", () => {
    const due = new Date("2026-06-10");
    const returned = new Date("2026-06-13");
    expect(calculateFine(due, returned, 500)).toBe(1500); // 3 days * Rs 5
  });

  it("returns 0 for early returns", () => {
    const due = new Date("2026-06-15");
    const returned = new Date("2026-06-10");
    expect(calculateFine(due, returned, 500)).toBe(0);
  });
});

describe("Library settings", () => {
  it("returns defaults for null settings", () => {
    const s = librarySettingsOf(null);
    expect(s.maxIssueDays).toBe(14);
    expect(s.maxBooksStudent).toBe(3);
    expect(s.maxBooksStaff).toBe(5);
    expect(s.finePerDayPaisa).toBe(500);
  });

  it("reads custom values from tenant settings", () => {
    const s = librarySettingsOf({ library: { maxIssueDays: 7, maxBooksStudent: 2 } });
    expect(s.maxIssueDays).toBe(7);
    expect(s.maxBooksStudent).toBe(2);
    expect(s.maxBooksStaff).toBe(5); // still default
  });
});

describe("Library book CRUD", () => {
  it("creates a book", async () => {
    const book = await withTenant(tenantId, async (tx) => {
      return tx.libraryBook.create({
        data: {
          tenantId,
          accessionNo: "LIB-TEST-001",
          title: "Test Book",
          author: "Test Author",
          category: "fiction",
          copies: 3,
          availableCopies: 3,
        },
      });
    });

    bookId = book.id;
    bookPublicId = book.publicId;
    expect(book.title).toBe("Test Book");
    expect(book.copies).toBe(3);
    expect(book.availableCopies).toBe(3);
  });

  it("enforces unique accessionNo per tenant", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.libraryBook.create({
          data: {
            tenantId,
            accessionNo: "LIB-TEST-001",
            title: "Duplicate Accession",
            copies: 1,
            availableCopies: 1,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("allows same accessionNo in different tenants", async () => {
    const book = await withTenant(tenantId2, async (tx) => {
      return tx.libraryBook.create({
        data: {
          tenantId: tenantId2,
          accessionNo: "LIB-TEST-001",
          title: "Same Accession Different Tenant",
          copies: 1,
          availableCopies: 1,
        },
      });
    });
    expect(book.accessionNo).toBe("LIB-TEST-001");
  });

  it("updates a book", async () => {
    const updated = await withTenant(tenantId, async (tx) => {
      return tx.libraryBook.update({
        where: { id: bookId },
        data: { title: "Updated Book Title", category: "non-fiction" },
      });
    });
    expect(updated.title).toBe("Updated Book Title");
    expect(updated.category).toBe("non-fiction");
  });
});

describe("Library issue/return", () => {
  it("issues a book to a student", async () => {
    const issue = await withTenant(tenantId, async (tx) => {
      const row = await tx.libraryIssue.create({
        data: {
          tenantId,
          bookId,
          borrowerType: "student",
          studentId,
          dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.libraryBook.update({
        where: { id: bookId },
        data: { availableCopies: { decrement: 1 } },
      });

      return row;
    });

    issueId = issue.id;
    issuePublicId = issue.publicId;
    expect(issue.status).toBe("issued");
    expect(issue.borrowerType).toBe("student");
  });

  it("decremented availableCopies", async () => {
    const book = await withTenant(tenantId, async (tx) => {
      return tx.libraryBook.findUnique({ where: { id: bookId } });
    });
    expect(book!.availableCopies).toBe(2);
  });

  it("returns a book and calculates fine", async () => {
    // Set due date in the past to trigger a fine
    await withTenant(tenantId, async (tx) => {
      await tx.libraryIssue.update({
        where: { id: issueId },
        data: { dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      });
    });

    const returned = await withTenant(tenantId, async (tx) => {
      const issue = await tx.libraryIssue.findUnique({ where: { id: issueId } });
      const finePaisa = calculateFine(issue!.dueAt, new Date(), 500);

      const row = await tx.libraryIssue.update({
        where: { id: issueId },
        data: {
          status: "returned",
          returnedAt: new Date(),
          finePaisa,
        },
      });

      await tx.libraryBook.update({
        where: { id: bookId },
        data: { availableCopies: { increment: 1 } },
      });

      return row;
    });

    expect(returned.status).toBe("returned");
    expect(returned.finePaisa).toBeGreaterThan(0);
  });

  it("restored availableCopies after return", async () => {
    const book = await withTenant(tenantId, async (tx) => {
      return tx.libraryBook.findUnique({ where: { id: bookId } });
    });
    expect(book!.availableCopies).toBe(3);
  });

  it("can mark an issue as lost", async () => {
    const issue = await withTenant(tenantId, async (tx) => {
      const row = await tx.libraryIssue.create({
        data: {
          tenantId,
          bookId,
          borrowerType: "student",
          studentId,
          dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.libraryBook.update({
        where: { id: bookId },
        data: { availableCopies: { decrement: 1 } },
      });

      return tx.libraryIssue.update({
        where: { id: row.id },
        data: { status: "lost", returnedAt: new Date() },
      });
    });

    expect(issue.status).toBe("lost");
  });
});

describe("RLS isolation — library", () => {
  it("cannot read books from another tenant", async () => {
    const books = await withTenant(tenantId2, async (tx) => {
      return tx.libraryBook.findMany({
        where: { tenantId: tenantId },
      });
    });
    expect(books.length).toBe(0);
  });

  it("cannot read issues from another tenant", async () => {
    const issues = await withTenant(tenantId2, async (tx) => {
      return tx.libraryIssue.findMany({
        where: { tenantId: tenantId },
      });
    });
    expect(issues.length).toBe(0);
  });
});
