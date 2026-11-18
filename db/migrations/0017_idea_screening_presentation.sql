-- 0017: Screening presentation.
--  * A second deck (.pptx / .pdf) the team uploads from My Ideas once its
--    screening result is published as Pass. It sits beside the final
--    presentation from 0010 (uploaded once the idea is marked Build), and the
--    upload route refuses the same file in both slots.
--  * screening_presentation_url holds a relative
--    /api/files/idea-presentations/{ideaId}/... URL (lib/storage/local.ts), so
--    the file route's per-idea access check covers it unchanged.
-- Every step is guarded so the file is safe to re-run.

IF COL_LENGTH('dbo.ideas', 'screening_presentation_url') IS NULL
  ALTER TABLE dbo.ideas ADD
    screening_presentation_url         NVARCHAR(1000)    NULL,
    screening_presentation_name        NVARCHAR(260)     NULL,
    screening_presentation_uploaded_at DATETIMEOFFSET(3) NULL,
    screening_presentation_uploaded_by UNIQUEIDENTIFIER  NULL
      CONSTRAINT fk_ideas_screening_presentation_uploaded_by REFERENCES dbo.profiles (id);
GO
