-- 0005_developer_role.sql
-- Adds the top-level 'developer' role and a forced-password-change flag.
--
-- * 'developer' is a superset of 'admin': dbo.fn_has_role(@u, 'admin') is
--   now also true for developers, so every stored procedure that gates on
--   admin (usp_reopen_review, usp_publish_batch, usp_vote_tallies) accepts
--   them without being redefined.
-- * users.must_change_password forces a password change at next sign-in
--   (set when an admin creates a user or resets a password).

ALTER TABLE roles DROP CONSTRAINT ck_roles_name;
GO

ALTER TABLE roles ADD CONSTRAINT ck_roles_name
  CHECK (name IN ('participant', 'mentor', 'admin', 'employee_voter', 'developer'));
GO

IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'developer')
  INSERT INTO roles (name) VALUES ('developer');
GO

ALTER TABLE users ADD must_change_password BIT NOT NULL CONSTRAINT df_users_must_change_password DEFAULT 0;
GO

CREATE OR ALTER FUNCTION dbo.fn_has_role(@user_id UNIQUEIDENTIFIER, @role NVARCHAR(40))
RETURNS BIT
AS
BEGIN
  RETURN CASE WHEN EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = @user_id
      AND (r.name = @role OR (@role = 'admin' AND r.name = 'developer'))
  ) THEN 1 ELSE 0 END;
END;
GO
