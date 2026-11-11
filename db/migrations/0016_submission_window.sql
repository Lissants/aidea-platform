-- 0016: Ideas can only be submitted inside the program's submission window.
--  * usp_submit_idea: identical to 0003 plus a window check on the database
--    clock. An empty submission_open_at means already open; an empty
--    submission_close_at means never closes. At the close instant itself
--    submissions are closed. Nobody is exempt.
--  * The app (lib/services/ideas.ts) runs the same check before saving, with
--    a dated message; this is the backstop for any other caller.
-- CREATE OR ALTER, so the file is safe to re-run.

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
  DECLARE @opens_at DATETIMEOFFSET, @closes_at DATETIMEOFFSET;

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

  SELECT @opens_at = submission_open_at, @closes_at = submission_close_at
    FROM programs WHERE id = @program_id;

  IF @opens_at IS NOT NULL AND @opens_at > SYSDATETIMEOFFSET()
    THROW 50004, 'Submissions are not open yet for this program', 1;

  IF @closes_at IS NOT NULL AND @closes_at <= SYSDATETIMEOFFSET()
    THROW 50004, 'Submissions are closed for this program', 1;

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
