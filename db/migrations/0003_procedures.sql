-- 0003_procedures.sql
-- SQL Server translation of the plpgsql functions in
-- supabase/migrations/0007, 0008, 0010, 0012 and 0015 (latest versions).
--
-- * `SECURITY DEFINER` + `auth.uid()` -> an explicit @actor_id parameter.
--   The app passes the signed-in user's id; each procedure re-checks that
--   the actor is allowed to perform the transition (defense in depth on top
--   of the service-layer checks, since there is no RLS any more).
-- * `RAISE EXCEPTION` -> THROW 5xxxx. The message text is unchanged so the
--   UI keeps showing the same errors (lib/db surfaces err.message).
-- * `FOR UPDATE` -> WITH (UPDLOCK, ROWLOCK) inside an explicit transaction.
-- * `ON CONFLICT` -> IF EXISTS (... WITH (UPDLOCK, HOLDLOCK)) UPDATE / INSERT.
-- * `RETURNING` -> OUTPUT ... INTO @table_variable.
-- * Every transactional procedure wraps its body in TRY/CATCH and rolls back
--   before re-throwing, so a failed call never leaves a doomed transaction
--   open on a pooled connection (or inside a caller's own TRY/CATCH).

CREATE OR ALTER FUNCTION dbo.fn_has_role(@user_id UNIQUEIDENTIFIER, @role NVARCHAR(40))
RETURNS BIT
AS
BEGIN
  RETURN CASE WHEN EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = @user_id AND r.name = @role
  ) THEN 1 ELSE 0 END;
END;
GO

CREATE OR ALTER FUNCTION dbo.fn_is_idea_team_member(@idea_id UNIQUEIDENTIFIER, @user_id UNIQUEIDENTIFIER)
RETURNS BIT
AS
BEGIN
  RETURN CASE WHEN EXISTS (
    SELECT 1 FROM idea_team_members WHERE idea_id = @idea_id AND profile_id = @user_id
  ) OR EXISTS (
    SELECT 1 FROM ideas WHERE id = @idea_id AND team_leader_id = @user_id
  ) THEN 1 ELSE 0 END;
END;
GO

-- ---------------------------------------------------------------------
-- usp_route_reviewer: assigns the priority-1 mentor if they have capacity,
-- else priority-2, else marks routing_required and notifies admins. Locks
-- the candidate mentor_profiles row to serialize concurrent submissions
-- racing for the same mentor's last slot. Called from usp_submit_idea
-- (inside its transaction); also safe to call on its own.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_route_reviewer
  @idea_id UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @program_id UNIQUEIDENTIFIER, @idea_title NVARCHAR(400);
  DECLARE @mentor_profile_id UNIQUEIDENTIFIER, @candidate UNIQUEIDENTIFIER;
  DECLARE @capacity INT, @active_count INT, @priority INT = 0;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @program_id = program_id, @idea_title = idea_title FROM ideas WHERE id = @idea_id;

  WHILE 1 = 1
  BEGIN
    SET @candidate = NULL;
    SELECT TOP (1) @candidate = mentor_profile_id, @priority = priority
      FROM idea_mentor_preferences
     WHERE idea_id = @idea_id AND priority > @priority
     ORDER BY priority ASC;

    IF @candidate IS NULL BREAK;

    SELECT @capacity = max_capacity
      FROM mentor_profiles WITH (UPDLOCK, ROWLOCK)
     WHERE id = @candidate;

    SELECT @active_count = COUNT(*)
      FROM review_assignments ra
      JOIN ideas i ON i.id = ra.idea_id
     WHERE ra.mentor_profile_id = @candidate
       AND i.program_id = @program_id
       AND ra.status = 'pending';

    IF @active_count < @capacity
    BEGIN
      SET @mentor_profile_id = @candidate;
      BREAK;
    END;
  END;

  IF @mentor_profile_id IS NOT NULL
  BEGIN
    IF EXISTS (SELECT 1 FROM review_assignments WITH (UPDLOCK, HOLDLOCK) WHERE idea_id = @idea_id)
      UPDATE review_assignments
         SET mentor_profile_id = @mentor_profile_id, status = 'pending', assigned_at = SYSDATETIMEOFFSET()
       WHERE idea_id = @idea_id;
    ELSE
      INSERT INTO review_assignments (idea_id, mentor_profile_id, status)
      VALUES (@idea_id, @mentor_profile_id, 'pending');

    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT mp.profile_id, 'reviewer_assigned', 'New review assigned',
           CONCAT('You have been assigned to review "', @idea_title, '".'), '/reviews'
      FROM mentor_profiles mp
     WHERE mp.id = @mentor_profile_id;
  END
  ELSE
  BEGIN
    IF EXISTS (SELECT 1 FROM review_assignments WITH (UPDLOCK, HOLDLOCK) WHERE idea_id = @idea_id)
      UPDATE review_assignments
         SET status = 'routing_required', mentor_profile_id = NULL
       WHERE idea_id = @idea_id;
    ELSE
      INSERT INTO review_assignments (idea_id, mentor_profile_id, status)
      VALUES (@idea_id, NULL, 'routing_required');

    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT ur.user_id, 'routing_required', 'Routing required',
           'An idea needs manual reviewer assignment.', '/review-assignment'
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin';
  END;

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

-- ---------------------------------------------------------------------
-- usp_submit_idea: locks the draft row, validates required fields, flips
-- status -> submitted, sets submitted_at + locked, then routes a reviewer,
-- all in one transaction.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_submit_idea
  @idea_id  UNIQUEIDENTIFIER,
  @actor_id UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @found UNIQUEIDENTIFIER, @status NVARCHAR(40), @program_id UNIQUEIDENTIFIER;
  DECLARE @title NVARCHAR(400), @problem NVARCHAR(MAX), @solution NVARCHAR(MAX);
  DECLARE @created_by UNIQUEIDENTIFIER, @leader UNIQUEIDENTIFIER;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @found = id, @status = status, @program_id = program_id,
         @title = idea_title, @problem = problem_opportunity, @solution = proposed_solution,
         @created_by = created_by, @leader = team_leader_id
    FROM ideas WITH (UPDLOCK, ROWLOCK)
   WHERE id = @idea_id;

  IF @found IS NULL
    THROW 50001, 'Idea not found', 1;

  IF @actor_id IS NULL OR (@actor_id <> @created_by AND @actor_id <> @leader)
    THROW 50003, 'Only the idea owner can submit this idea', 1;

  IF @status <> 'draft'
    THROW 50002, 'Only draft ideas can be submitted', 1;

  IF @title = '' OR @problem = '' OR @solution = ''
    THROW 50002, 'Idea is missing required fields', 1;

  IF NOT EXISTS (SELECT 1 FROM idea_impacts WHERE idea_id = @idea_id)
    THROW 50002, 'At least one impact is required before submission', 1;

  UPDATE ideas
     SET status = 'submitted', submitted_at = SYSDATETIMEOFFSET(), locked = 1
   WHERE id = @idea_id;

  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
  VALUES (@program_id, 'idea', @idea_id, @actor_id, 'idea_submitted', N'{"status":"submitted"}');

  EXEC dbo.usp_route_reviewer @idea_id = @idea_id;

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

-- ---------------------------------------------------------------------
-- usp_submit_review: locks a review row and flips draft/reopened -> submitted.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_submit_review
  @review_id UNIQUEIDENTIFIER,
  @actor_id  UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @found UNIQUEIDENTIFIER, @status NVARCHAR(40), @recommendation NVARCHAR(40), @reviewer UNIQUEIDENTIFIER;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @found = id, @status = status, @recommendation = recommendation, @reviewer = reviewer_id
    FROM reviews WITH (UPDLOCK, ROWLOCK)
   WHERE id = @review_id;

  IF @found IS NULL
    THROW 50001, 'Review not found', 1;

  IF @actor_id IS NULL OR @actor_id <> @reviewer
    THROW 50003, 'Only the assigned reviewer can submit this review', 1;

  IF @status NOT IN ('draft', 'reopened')
    THROW 50002, 'Only draft or reopened reviews can be submitted', 1;

  IF @recommendation IS NULL
    THROW 50002, 'A recommendation is required before submitting a review', 1;

  UPDATE reviews
     SET status = 'submitted', submitted_at = SYSDATETIMEOFFSET(), version = version + 1
   WHERE id = @review_id;

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

-- ---------------------------------------------------------------------
-- usp_reopen_review: admin-only reopen with a mandatory reason, audited and
-- notifies the reviewer.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_reopen_review
  @review_id UNIQUEIDENTIFIER,
  @reason    NVARCHAR(MAX),
  @actor_id  UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @found UNIQUEIDENTIFIER, @status NVARCHAR(40), @reviewer UNIQUEIDENTIFIER;

  IF @reason IS NULL OR LEN(LTRIM(RTRIM(@reason))) = 0
    THROW 50002, 'A reason is required to reopen a review', 1;

  IF dbo.fn_has_role(@actor_id, 'admin') = 0
    THROW 50003, 'Only an admin can reopen a review', 1;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @found = id, @status = status, @reviewer = reviewer_id
    FROM reviews WITH (UPDLOCK, ROWLOCK)
   WHERE id = @review_id;

  IF @found IS NULL
    THROW 50001, 'Review not found', 1;

  IF @status <> 'submitted'
    THROW 50002, 'Only submitted reviews can be reopened', 1;

  UPDATE reviews
     SET status = 'reopened', reopened_at = SYSDATETIMEOFFSET(), reopen_reason = @reason
   WHERE id = @review_id;

  INSERT INTO audit_logs (entity_type, entity_id, actor_id, action, reason, prior_value)
  VALUES ('review', @review_id, @actor_id, 'review_reopened', @reason, N'{"status":"submitted"}');

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (@reviewer, 'review_reopened', 'Review reopened',
          COALESCE(@reason, 'Your review was reopened for changes.'), '/reviews');

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
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
  ELSE IF @entity_type = 'showcase_project'
  BEGIN
    UPDATE sp SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM showcase_projects sp
     WHERE sp.program_id = @program_id AND sp.published = 0;
    SELECT @title = 'Showcase project published',
           @body = 'Your project is now live on the Project Showcase.',
           @link = '/showcase';
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
-- usp_submit_vote: checks the voting window is open and the voter isn't on
-- the idea's team, then inserts. uq_votes_period_voter guarantees one vote
-- per voter per period even under races.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_submit_vote
  @voting_period_id UNIQUEIDENTIFIER,
  @voter_id         UNIQUEIDENTIFIER,
  @idea_id          UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @found UNIQUEIDENTIFIER, @opens DATETIMEOFFSET(3), @closes DATETIMEOFFSET(3);
  DECLARE @now DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();

  SELECT @found = id, @opens = opens_at, @closes = closes_at
    FROM voting_periods WHERE id = @voting_period_id;

  IF @found IS NULL
    THROW 50001, 'Voting period not found', 1;

  IF @now < @opens OR @now > @closes
    THROW 50002, 'Voting is not currently open', 1;

  IF dbo.fn_is_idea_team_member(@idea_id, @voter_id) = 1
    THROW 50010, 'You cannot vote for your own team''s idea', 1;

  INSERT INTO votes (voting_period_id, voter_id, idea_id)
  VALUES (@voting_period_id, @voter_id, @idea_id);
END;
GO

-- ---------------------------------------------------------------------
-- usp_vote_tallies: aggregate-only vote counts per idea for a voting
-- period. Any signed-in user once results_published = 1; admins can also
-- see live counts beforehand. Never exposes an individual ballot.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_vote_tallies
  @voting_period_id UNIQUEIDENTIFIER,
  @actor_id         UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @published BIT;
  SELECT @published = results_published FROM voting_periods WHERE id = @voting_period_id;

  IF ISNULL(@published, 0) = 0 AND dbo.fn_has_role(@actor_id, 'admin') = 0
    THROW 50003, 'Results are not published for this voting period', 1;

  SELECT v.idea_id, i.idea_title, i.team_name, COUNT(*) AS vote_count
    FROM votes v
    JOIN ideas i ON i.id = v.idea_id
   WHERE v.voting_period_id = @voting_period_id
   GROUP BY v.idea_id, i.idea_title, i.team_name
   ORDER BY vote_count DESC;
END;
GO
