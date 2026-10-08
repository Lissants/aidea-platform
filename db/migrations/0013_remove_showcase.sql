-- 0013: Project Showcase removed; voting candidates are the Build ideas.
--  * Drops showcase_projects, programs.showcase_open_at (and its timeline
--    TBA entry) and the 'showcase' program stage.
--  * usp_publish_batch: identical to 0009 minus the showcase_project branch.
--  * v_vote_candidates: a candidate is now a submitted idea whose screening
--    Pass and qualifier Build are both published. A final presentation
--    assessment is no longer required. usp_submit_vote (0011) already checks
--    this view, so it is unchanged.
-- Every step is guarded so the file is safe to re-run.

IF OBJECT_ID('dbo.showcase_projects', 'U') IS NOT NULL
  DROP TABLE dbo.showcase_projects;
GO

IF COL_LENGTH('dbo.programs', 'timeline_tba') IS NOT NULL
  EXEC (N'UPDATE dbo.programs
            SET timeline_tba = NULLIF(JSON_MODIFY(timeline_tba, ''$.showcase_open_at'', NULL), ''{}'')
          WHERE timeline_tba LIKE N''%showcase_open_at%'';');
GO

IF COL_LENGTH('dbo.programs', 'showcase_open_at') IS NOT NULL
  ALTER TABLE dbo.programs DROP COLUMN showcase_open_at;
GO

DELETE FROM dbo.program_stages WHERE stage_key = 'showcase';
IF OBJECT_ID('dbo.ck_program_stages_stage_key', 'C') IS NOT NULL
  ALTER TABLE dbo.program_stages DROP CONSTRAINT ck_program_stages_stage_key;
ALTER TABLE dbo.program_stages ADD CONSTRAINT ck_program_stages_stage_key CHECK (stage_key IN (
  'submission', 'review', 'screening', 'qualifier', 'project_mentor',
  'final_presentation', 'voting'));
GO

CREATE OR ALTER VIEW dbo.v_vote_candidates AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
    JOIN screening_decisions sd ON sd.idea_id = i.id
    JOIN qualifier_assessments qa ON qa.idea_id = i.id
   WHERE i.status = 'submitted'
     AND sd.decision = 'pass_to_qualifier' AND sd.published = 1
     AND qa.status = 'finalized' AND qa.build_decision = 'build' AND qa.published = 1;
GO

-- usp_publish_batch: identical to 0009 except the showcase_project branch
-- is gone (the table no longer exists).
CREATE OR ALTER PROCEDURE dbo.usp_publish_batch
  @program_id  UNIQUEIDENTIFIER,
  @entity_type NVARCHAR(60),
  @actor_id    UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @now DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();
  DECLARE @updated TABLE (id UNIQUEIDENTIFIER NOT NULL, idea_id UNIQUEIDENTIFIER NOT NULL);
  DECLARE @count INT, @title NVARCHAR(400), @body NVARCHAR(400), @link NVARCHAR(100) = '/my-ideas';
  -- Per-idea notifications: only Pass / Build / mentor-assigned notify the team.
  DECLARE @notify TABLE (idea_id UNIQUEIDENTIFIER NOT NULL, type NVARCHAR(60) NOT NULL, title NVARCHAR(400) NOT NULL, body NVARCHAR(MAX) NOT NULL);
  DECLARE @generic BIT = 1;

  IF dbo.fn_has_role(@actor_id, 'admin') = 0
    THROW 50003, 'Only an admin can publish results', 1;

  BEGIN TRY
  BEGIN TRAN;

  IF @entity_type = 'screening_decision'
  BEGIN
    UPDATE sd SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM screening_decisions sd JOIN ideas i ON i.id = sd.idea_id
     WHERE i.program_id = @program_id AND sd.published = 0 AND sd.decided_at IS NOT NULL;
    SET @generic = 0;
    INSERT INTO @notify (idea_id, type, title, body)
    SELECT sd.idea_id, 'idea_screening_passed', 'Your idea passed screening',
           N'Your idea passed screening and moves on to the qualifier stage.'
      FROM @updated u JOIN screening_decisions sd ON sd.id = u.id
     WHERE sd.decision = 'pass_to_qualifier';
  END
  ELSE IF @entity_type = 'qualifier_assessment'
  BEGIN
    UPDATE qa SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM qualifier_assessments qa JOIN ideas i ON i.id = qa.idea_id
     WHERE i.program_id = @program_id AND qa.published = 0 AND qa.status = 'finalized';
    SET @generic = 0;
    INSERT INTO @notify (idea_id, type, title, body)
    SELECT qa.idea_id, 'idea_qualifier_build', 'Your idea was selected to Build',
           N'Your idea passed the qualifier with a Build decision.'
      FROM @updated u JOIN qualifier_assessments qa ON qa.id = u.id
     WHERE qa.build_decision = 'build';
  END
  ELSE IF @entity_type = 'project_mentor_assignment'
  BEGIN
    UPDATE pma SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM project_mentor_assignments pma JOIN ideas i ON i.id = pma.idea_id
     WHERE i.program_id = @program_id AND pma.published = 0;
    SET @generic = 0;
    INSERT INTO @notify (idea_id, type, title, body)
    SELECT pma.idea_id, 'idea_mentor_assigned', 'Project mentor assigned',
           CONCAT(N'A project mentor has been assigned to your idea: ', pr.full_name, N'.')
      FROM @updated u
      JOIN project_mentor_assignments pma ON pma.id = u.id
      JOIN mentor_profiles mp ON mp.id = pma.mentor_profile_id
      JOIN profiles pr ON pr.id = mp.profile_id;
  END
  ELSE IF @entity_type = 'final_presentation_assessment'
  BEGIN
    UPDATE fpa SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM final_presentation_assessments fpa
     WHERE fpa.program_id = @program_id AND fpa.published = 0 AND fpa.status = 'finalized';
    SELECT @title = 'Final presentation result published',
           @body = 'Your idea''s final presentation result has been published.';
  END
  ELSE
  BEGIN
    DECLARE @msg NVARCHAR(200) = CONCAT('Unknown entity_type: ', @entity_type);
    THROW 50002, @msg, 1;
  END;

  SELECT @count = COUNT(*) FROM @updated;

  INSERT INTO publications (program_id, entity_type, entity_id, published_by, published_at)
  SELECT @program_id, @entity_type, id, @actor_id, @now FROM @updated;

  IF @generic = 1
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT DISTINCT i.created_by, 'published', @title, @body, @link
      FROM @updated u JOIN ideas i ON i.id = u.idea_id;

  -- Creator, team leader (when not vacant) and every team member, once each.
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT r.user_id, n.type, n.title, n.body, @link
    FROM @notify n
    JOIN (
      SELECT id AS idea_id, created_by AS user_id FROM ideas
      UNION SELECT id, team_leader_id FROM ideas WHERE team_leader_id IS NOT NULL
      UNION SELECT idea_id, profile_id FROM idea_team_members
    ) r ON r.idea_id = n.idea_id;

  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
  VALUES (@program_id, @entity_type, @program_id, @actor_id, 'publish_batch',
          CONCAT(N'{"published_count":', @count, N'}'));

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;

  SELECT @count AS published_count;
END;
GO
