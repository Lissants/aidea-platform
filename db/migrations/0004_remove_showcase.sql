-- =====================================================================
-- 0004_remove_showcase.sql
-- Removes the Project Showcase feature. Voting candidates are now every
-- idea whose qualifier assessment is finalized with build_decision =
-- 'build', and usp_submit_vote enforces that.
-- =====================================================================

IF OBJECT_ID('dbo.showcase_projects', 'U') IS NOT NULL
  DROP TABLE dbo.showcase_projects;
GO

IF COL_LENGTH('dbo.programs', 'showcase_open_at') IS NOT NULL
  ALTER TABLE dbo.programs DROP COLUMN showcase_open_at;
GO

DELETE FROM dbo.program_stages WHERE stage_key = 'showcase';
ALTER TABLE dbo.program_stages DROP CONSTRAINT ck_program_stages_stage_key;
ALTER TABLE dbo.program_stages ADD CONSTRAINT ck_program_stages_stage_key CHECK (stage_key IN (
  'submission', 'review', 'screening', 'qualifier', 'project_mentor',
  'final_presentation', 'voting'));
GO

-- ---------------------------------------------------------------------
-- usp_publish_batch: publishes every finalized-but-unpublished row for a
-- program + entity_type, writing one publications row per entity plus one
-- audit_logs row, and notifying only the owners of the ideas actually
-- published in this batch. Returns a single row: published_count.
-- ---------------------------------------------------------------------
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
    SELECT @title = 'Screening result published',
           @body = 'Your idea''s screening decision has been published.';
  END
  ELSE IF @entity_type = 'qualifier_assessment'
  BEGIN
    UPDATE qa SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM qualifier_assessments qa JOIN ideas i ON i.id = qa.idea_id
     WHERE i.program_id = @program_id AND qa.published = 0 AND qa.status = 'finalized';
    SELECT @title = 'Qualifier result published',
           @body = 'Your idea''s qualifier result (Build / No Build) has been published.';
  END
  ELSE IF @entity_type = 'project_mentor_assignment'
  BEGIN
    UPDATE pma SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM project_mentor_assignments pma JOIN ideas i ON i.id = pma.idea_id
     WHERE i.program_id = @program_id AND pma.published = 0;
    SELECT @title = 'Project mentor assigned',
           @body = 'A project mentor has been assigned to your idea.';
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

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT DISTINCT i.created_by, 'published', @title, @body, @link
    FROM @updated u JOIN ideas i ON i.id = u.idea_id;

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

-- ---------------------------------------------------------------------
-- usp_submit_vote: checks the voting window is open, the idea is a Build
-- candidate in the period's program (finalized qualifier assessment with
-- build_decision = 'build') and the voter isn't on the idea's team, then
-- inserts. uq_votes_period_voter guarantees one vote per voter per period
-- even under races.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_submit_vote
  @voting_period_id UNIQUEIDENTIFIER,
  @voter_id         UNIQUEIDENTIFIER,
  @idea_id          UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @found UNIQUEIDENTIFIER, @program UNIQUEIDENTIFIER, @opens DATETIMEOFFSET(3), @closes DATETIMEOFFSET(3);
  DECLARE @now DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();

  SELECT @found = id, @program = program_id, @opens = opens_at, @closes = closes_at
    FROM voting_periods WHERE id = @voting_period_id;

  IF @found IS NULL
    THROW 50001, 'Voting period not found', 1;

  IF @now < @opens OR @now > @closes
    THROW 50002, 'Voting is not currently open', 1;

  IF NOT EXISTS (SELECT 1 FROM ideas i
                   JOIN qualifier_assessments qa ON qa.idea_id = i.id
                  WHERE i.id = @idea_id AND i.program_id = @program
                    AND qa.status = 'finalized' AND qa.build_decision = 'build')
    THROW 50011, 'This idea is not a voting candidate', 1;

  IF dbo.fn_is_idea_team_member(@idea_id, @voter_id) = 1
    THROW 50010, 'You cannot vote for your own team''s idea', 1;

  INSERT INTO votes (voting_period_id, voter_id, idea_id)
  VALUES (@voting_period_id, @voter_id, @idea_id);
END;
GO
