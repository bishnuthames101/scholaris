-- Phase 10 SaaS layer — RLS policies for plans, subscriptions, invoices, country_configs.
-- Plans & country_configs are platform-level (superadmin only for writes, all can read).
-- Subscriptions & subscription_invoices are tenant-scoped.
-- Apply with: npm run db:rls

-- Plans: readable by all authenticated users, writable by superadmin only.
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON plans;
CREATE POLICY plans_read ON plans FOR SELECT USING (true);
DROP POLICY IF EXISTS plans_write ON plans;
CREATE POLICY plans_write ON plans FOR ALL USING (app_is_superadmin()) WITH CHECK (app_is_superadmin());

-- Subscriptions: tenant-scoped (school can see their own, superadmin sees all).
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions
  USING (app_is_superadmin() OR tenant_id = app_tenant_id())
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id());

-- Subscription invoices: tenant-scoped.
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscription_invoices;
CREATE POLICY tenant_isolation ON subscription_invoices
  USING (app_is_superadmin() OR tenant_id = app_tenant_id())
  WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id());

-- Country configs: readable by all, writable by superadmin only.
ALTER TABLE country_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS country_configs_read ON country_configs;
CREATE POLICY country_configs_read ON country_configs FOR SELECT USING (true);
DROP POLICY IF EXISTS country_configs_write ON country_configs;
CREATE POLICY country_configs_write ON country_configs FOR ALL USING (app_is_superadmin()) WITH CHECK (app_is_superadmin());
