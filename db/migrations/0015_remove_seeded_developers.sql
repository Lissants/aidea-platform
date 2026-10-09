-- 0015: the seed no longer creates platform Developers. Developers and Admins
-- now come from AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS at sign-in (see
-- lib/auth/roles.ts), so the three previously seeded Developers become Users.
--  * Only accounts still holding developer or admin are changed; a tier an
--    admin has since set by hand (mentor, participant) is left alone.
--  * employee_voter is kept, and added if missing.
-- Every step is guarded so the file is safe to re-run.

DECLARE @emails TABLE (email NVARCHAR(320) PRIMARY KEY);
INSERT INTO @emails (email) VALUES
  ('janice.ong@godrejcp.com'),
  ('jose.siahaan@godrejcp.com'),
  ('yudha.nugraha@godrejcp.com');

-- MAX picks 'developer' over 'admin' if an account somehow holds both.
DECLARE @demoted TABLE (user_id UNIQUEIDENTIFIER PRIMARY KEY, prior_tier NVARCHAR(40) NOT NULL);
INSERT INTO @demoted (user_id, prior_tier)
SELECT p.id, MAX(r.name)
  FROM profiles p
  JOIN @emails e ON e.email = p.email
  JOIN user_roles ur ON ur.user_id = p.id
  JOIN roles r ON r.id = ur.role_id
 WHERE r.name IN ('developer', 'admin')
 GROUP BY p.id;

DELETE ur
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN @demoted d ON d.user_id = ur.user_id
 WHERE r.name IN ('developer', 'admin');

INSERT INTO user_roles (user_id, role_id)
SELECT d.user_id, r.id
  FROM @demoted d CROSS JOIN roles r
 WHERE r.name IN ('participant', 'employee_voter')
   AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = d.user_id AND ur.role_id = r.id);

INSERT INTO audit_logs (entity_type, entity_id, actor_id, action, prior_value, new_value, reason)
SELECT 'users', d.user_id, NULL, 'user_tier_set_by_settings', N'{"tier":"' + d.prior_tier + N'"}', N'{"tier":"participant"}',
       N'Seeded Developer removed (migration 0015)'
  FROM @demoted d;
GO
