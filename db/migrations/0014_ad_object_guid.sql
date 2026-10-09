-- 0014: on-premises Active Directory sign-in (LDAPS).
--  * users.ad_object_guid links an account to its AD objectGUID, the same
--    way users.entra_oid links an Entra ID identity. NULL unless linked, so
--    the unique index is filtered (a UNIQUE constraint allows only one NULL).
-- Every step is guarded so the file is safe to re-run.

IF COL_LENGTH('dbo.users', 'ad_object_guid') IS NULL
  ALTER TABLE dbo.users ADD ad_object_guid NVARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_users_ad_object_guid' AND object_id = OBJECT_ID('dbo.users'))
  CREATE UNIQUE INDEX uq_users_ad_object_guid ON dbo.users (ad_object_guid) WHERE ad_object_guid IS NOT NULL;
GO
