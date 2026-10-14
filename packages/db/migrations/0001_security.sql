ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE outlets FORCE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_app;
GRANT SELECT ON users, roles, permissions, role_permissions, plans TO pos_app;
GRANT SELECT, INSERT, UPDATE ON sessions TO pos_app;
GRANT INSERT ON auth_events TO pos_app;
GRANT SELECT ON tenants, memberships, membership_outlets, subscriptions TO pos_app;
-- PostgreSQL row locking requires UPDATE privilege. Lock-only RLS policies
-- permit visible row locks but WITH CHECK(false) prohibits row mutations.
GRANT UPDATE (status) ON tenants TO pos_app;
GRANT UPDATE (active) ON memberships TO pos_app;
GRANT SELECT, INSERT, UPDATE ON outlets, devices TO pos_app;
GRANT SELECT, INSERT ON audit_logs TO pos_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM pos_app;
