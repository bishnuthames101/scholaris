-- Scholaris RLS policies (§5.3) — apply after `prisma migrate deploy`.
-- App sets transaction-local GUCs via withTenant():
--   app.tenant_id      → internal tenant id ('' for platform-level)
--   app.is_superadmin  → 'true' when acting as superadmin
--
-- The Prisma app role must NOT be BYPASSRLS. Supabase's `postgres` role owns
-- the tables, so we FORCE row level security to apply to the owner too.

-- Helper: current tenant id or NULL
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION app_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
$$;

-- ── tenants ───────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (app_is_superadmin() OR id = app_tenant_id())
  WITH CHECK (app_is_superadmin() OR id = app_tenant_id());

-- ── users ─────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (app_is_superadmin() OR tenant_id = app_tenant_id())
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id());

-- ── roles (tenant roles + shared system roles) ────────────────
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles
  USING (app_is_superadmin() OR tenant_id = app_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id());

-- ── permissions (global read-only reference data) ─────────────
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_all ON permissions;
CREATE POLICY read_all ON permissions FOR SELECT USING (true);
DROP POLICY IF EXISTS superadmin_write ON permissions;
CREATE POLICY superadmin_write ON permissions
  USING (app_is_superadmin()) WITH CHECK (app_is_superadmin());

-- ── role_permissions / user_roles (follow parent scoping) ─────
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON role_permissions;
CREATE POLICY tenant_isolation ON role_permissions
  USING (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id
      AND (r.tenant_id = app_tenant_id() OR r.tenant_id IS NULL)))
  WITH CHECK (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = app_tenant_id()));

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON user_roles;
CREATE POLICY tenant_isolation ON user_roles
  USING (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = app_tenant_id()))
  WITH CHECK (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = app_tenant_id()));

-- ── refresh_tokens / password_resets ──────────────────────────
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON refresh_tokens;
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (app_is_superadmin() OR tenant_id = app_tenant_id())
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id());

ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON password_resets;
CREATE POLICY tenant_isolation ON password_resets
  USING (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = app_tenant_id()))
  WITH CHECK (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = app_tenant_id()));

-- ── audit_log (append-only: INSERT + SELECT, never UPDATE/DELETE) ──
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_select ON audit_log;
CREATE POLICY audit_select ON audit_log FOR SELECT
  USING (app_is_superadmin() OR tenant_id = app_tenant_id());
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id() OR tenant_id IS NULL);
-- No UPDATE/DELETE policies → both are denied by RLS. Belt-and-braces trigger:
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
