/**
 * Applies RLS policy SQL files (prisma/rls/*.sql) to the database.
 * Run after `prisma migrate deploy`:  npm run db:rls
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dir = join(__dirname, "..", "prisma", "rls");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`Applying ${file}…`);
    const sql = readFileSync(join(dir, file), "utf8");
    // Split on statement boundaries, keeping $$-quoted function bodies intact.
    const statements: string[] = [];
    let buf = "";
    let inDollar = false;
    for (const line of sql.split("\n")) {
      const stripped = line.replace(/--.*$/, "");
      const dollarCount = (stripped.match(/\$\$/g) ?? []).length;
      if (dollarCount % 2 === 1) inDollar = !inDollar;
      buf += line + "\n";
      if (!inDollar && stripped.trimEnd().endsWith(";")) {
        statements.push(buf.trim());
        buf = "";
      }
    }
    if (buf.trim()) statements.push(buf.trim());

    for (const stmt of statements) {
      if (!stmt) continue;
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log(`  ✓ ${statements.length} statements`);
  }
  console.log("RLS applied.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
