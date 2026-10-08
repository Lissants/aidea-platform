-- 0010_idea_presentation.sql
-- Final presentation deck (.pptx / .pdf) a team uploads from My Ideas once
-- its qualifier result is published as Build. Viewed by the team, mentors
-- and admins. presentation_url holds a relative
-- /api/files/idea-presentations/... URL (lib/storage/local.ts); re-uploading
-- replaces it. Columns live on ideas so the file goes with the idea.

ALTER TABLE ideas ADD
  presentation_url         NVARCHAR(1000)    NULL,
  presentation_name        NVARCHAR(260)     NULL,
  presentation_uploaded_at DATETIMEOFFSET(3) NULL,
  presentation_uploaded_by UNIQUEIDENTIFIER  NULL CONSTRAINT fk_ideas_presentation_uploaded_by REFERENCES profiles (id);
GO
