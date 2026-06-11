/**
 * Creates the `scholaris_app` database role the application connects as.
 *
 * Supabase's `postgres` role has BYPASSRLS, so RLS never applies to it.
 * The app must connect as a non-bypass role for tenant isolation to work.
 * `postgres` (DIRECT_URL) remains for migrations and seeding only.
 *
 * Usage:  SCHOLARIS_APP_DB_PASSWORD=... npm run db:role
 * Idempotent — safe to re-run (e.g. after new migrations, to re-grant).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  const password = process.env.SCHOLARIS_APP_DB_PASSWORD;
  if (!password) throw new Error("Set SCHOLARIS_APP_DB_PASSWORD");
  if (password.includes("'")) throw new Error("Password must not contain single quotes");

  const statements = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'scholaris_app') THEN
         CREATE ROLE scholaris_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
       END IF;
     END $$;`,
    `ALTER ROLE scholaris_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}';`,
    `GRANT USAGE ON SCHEMA public TO scholaris_app;`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scholaris_app;`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scholaris_app;`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO scholaris_app;`,
    // Future tables created by prisma migrate (as postgres) get grants automatically:
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scholaris_app;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO scholaris_app;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
       GRANT EXECUTE ON FUNCTIONS TO scholaris_app;`,
  ];

  for (const stmt of statements) await prisma.$executeRawUnsafe(stmt);

  const check = await prisma.$queryRawUnsafe<{ rolname: string; rolbypassrls: boolean }[]>(
    `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'scholaris_app'`,
  );
  console.log("scholaris_app ready:", check);
  console.log("Point DATABASE_URL at scholaris_app (pooler username: scholaris_app.<project-ref>).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
