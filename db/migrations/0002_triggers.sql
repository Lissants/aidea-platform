-- 0002_triggers.sql
-- SQL Server translation of supabase/migrations/0006_triggers.sql.
--
-- Postgres used BEFORE row triggers that mutate NEW; SQL Server only has
-- AFTER / INSTEAD OF statement triggers, so these update the affected rows
-- (joined through the `inserted` pseudo-table) after the fact. The database
-- RECURSIVE_TRIGGERS option is OFF by default, so a trigger updating its own
-- table does not re-fire itself.
--
-- Reminder: because these tables have triggers, `INSERT/UPDATE ... OUTPUT`
-- without `INTO` is not allowed on them. Generate ids in the app instead.

CREATE OR ALTER TRIGGER trg_profiles_updated_at ON profiles AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE t SET updated_at = SYSDATETIMEOFFSET() FROM profiles t JOIN inserted i ON i.id = t.id;
END;
GO

CREATE OR ALTER TRIGGER trg_programs_updated_at ON programs AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE t SET updated_at = SYSDATETIMEOFFSET() FROM programs t JOIN inserted i ON i.id = t.id;
END;
GO

CREATE OR ALTER TRIGGER trg_ideas_updated_at ON ideas AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE t SET updated_at = SYSDATETIMEOFFSET() FROM ideas t JOIN inserted i ON i.id = t.id;
END;
GO

CREATE OR ALTER TRIGGER trg_reviews_updated_at ON reviews AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE t SET updated_at = SYSDATETIMEOFFSET() FROM reviews t JOIN inserted i ON i.id = t.id;
END;
GO

-- Keep final_presentation_assessments.program_id in sync with its idea's
-- program_id so the one-winner-per-program filtered indexes can rely on a
-- plain column.
CREATE OR ALTER TRIGGER trg_final_presentation_program_id
ON final_presentation_assessments AFTER INSERT, UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT (UPDATE(idea_id) OR UPDATE(program_id)) RETURN;
  UPDATE fpa
     SET program_id = i.program_id
    FROM final_presentation_assessments fpa
    JOIN inserted ins ON ins.id = fpa.id
    JOIN ideas i ON i.id = fpa.idea_id
   WHERE fpa.program_id IS NULL OR fpa.program_id <> i.program_id;
END;
GO

-- Defense-in-depth guard against voting for your own team, mirroring the
-- check inside usp_submit_vote in case a future code path inserts directly.
CREATE OR ALTER TRIGGER trg_guard_vote_not_own_team ON votes AFTER INSERT AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1 FROM inserted v
    JOIN idea_team_members itm ON itm.idea_id = v.idea_id AND itm.profile_id = v.voter_id
  ) OR EXISTS (
    SELECT 1 FROM inserted v
    JOIN ideas i ON i.id = v.idea_id AND i.team_leader_id = v.voter_id
  )
    THROW 50010, 'Cannot vote for your own team''s idea', 1;
END;
GO
