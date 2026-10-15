-- 0012: Committing to one idea is triggered by Build, not by passing screening.
--  * A person on an idea whose qualifier Build decision is published must
--    commit to one Build idea and is dropped from their other in-progress
--    ideas in the program (usp_commit_to_idea). With nothing else in
--    progress there is nothing to choose and no prompt.
--  * "In progress" (v_open_ideas) = submitted, with no published Not Pass
--    screening and no published No Build qualifier. Ideas that already ended
--    keep their team.
--  * Being on a Build idea (not just a screening Pass) is what stops a person
--    joining new ideas in the program (lib/services/ideas.ts, profile search).
--  * v_approved_ideas (screening Pass published) is kept; it still marks
--    ideas as approved for display and presentation upload.

CREATE OR ALTER VIEW dbo.v_build_ideas AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
    JOIN qualifier_assessments qa ON qa.idea_id = i.id
   WHERE qa.build_decision = 'build' AND qa.published = 1;
GO

CREATE OR ALTER VIEW dbo.v_open_ideas AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
   WHERE i.status = 'submitted'
     AND NOT EXISTS (SELECT 1 FROM screening_decisions sd
                      WHERE sd.idea_id = i.id AND sd.decision = 'not_pass' AND sd.published = 1)
     AND NOT EXISTS (SELECT 1 FROM qualifier_assessments qa
                      WHERE qa.idea_id = i.id AND qa.build_decision = 'no_build' AND qa.published = 1);
GO

-- ---------------------------------------------------------------------
-- usp_commit_to_idea: the actor keeps the Build idea @idea_id and leaves
-- every other in-progress idea of the same program. Leaving as leader
-- vacates the slot. Re-running once nothing is left to resolve is a no-op.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_commit_to_idea
  @idea_id  UNIQUEIDENTIFIER,
  @actor_id UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @program_id UNIQUEIDENTIFIER, @actor_name NVARCHAR(200), @kept_title NVARCHAR(400);
  DECLARE @left TABLE (idea_id UNIQUEIDENTIFIER NOT NULL, was_leader BIT NOT NULL);
  DECLARE @locked INT;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @program_id = program_id, @kept_title = idea_title FROM ideas WHERE id = @idea_id;
  IF @program_id IS NULL
    THROW 50001, 'Idea not found', 1;

  -- Lock every in-progress idea of this program the actor is on, so two
  -- concurrent commits by the same person serialize.
  SELECT @locked = COUNT(*) FROM ideas i WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.v_open_ideas o ON o.idea_id = i.id
   WHERE i.program_id = @program_id
     AND (i.team_leader_id = @actor_id
          OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @actor_id));

  IF NOT EXISTS (SELECT 1 FROM dbo.v_build_ideas WHERE idea_id = @idea_id)
    THROW 50002, 'You can only commit to an idea marked Build', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.v_idea_participants WHERE idea_id = @idea_id AND profile_id = @actor_id)
    THROW 50003, 'You are not on this idea''s team', 1;

  INSERT INTO @left (idea_id, was_leader)
  SELECT DISTINCT p.idea_id, CASE WHEN p.role = 'leader' THEN 1 ELSE 0 END
    FROM dbo.v_idea_participants p
    JOIN dbo.v_open_ideas o ON o.idea_id = p.idea_id
   WHERE p.profile_id = @actor_id AND p.program_id = @program_id AND p.idea_id <> @idea_id;

  IF NOT EXISTS (SELECT 1 FROM @left)
  BEGIN
    COMMIT;
    SELECT 0 AS left_count;
    RETURN;
  END;

  DELETE m FROM idea_team_members m JOIN @left l ON l.idea_id = m.idea_id
   WHERE m.profile_id = @actor_id;
  UPDATE i SET team_leader_id = NULL FROM ideas i JOIN @left l ON l.idea_id = i.id
   WHERE i.team_leader_id = @actor_id;

  SELECT @actor_name = full_name FROM profiles WHERE id = @actor_id;

  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
  SELECT @program_id, 'idea', l.idea_id, @actor_id, 'team_member_committed_elsewhere',
         CONCAT(N'{"profile_id":"', LOWER(CONVERT(NVARCHAR(36), @actor_id)), N'","kept_idea_id":"',
                LOWER(CONVERT(NVARCHAR(36), @idea_id)), N'","was_leader":', IIF(l.was_leader = 1, N'true', N'false'), N'}')
    FROM @left l;

  -- Remaining team + creator of each idea the actor left.
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT DISTINCT r.user_id, 'team_member_left', 'A team member left your idea',
         CONCAT(@actor_name, N' committed to another idea and left "', i.idea_title, N'".',
                IIF(l.was_leader = 1, N' The team leader slot is now vacant; an admin will assign a new leader.', N'')),
         '/my-ideas'
    FROM @left l
    JOIN ideas i ON i.id = l.idea_id
    JOIN (
      SELECT id AS idea_id, created_by AS user_id FROM ideas
      UNION SELECT id, team_leader_id FROM ideas WHERE team_leader_id IS NOT NULL
      UNION SELECT idea_id, profile_id FROM idea_team_members
    ) r ON r.idea_id = l.idea_id
   WHERE r.user_id <> @actor_id;

  -- Admins: a leader slot became vacant.
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'team_leader_vacant', 'Team leader slot vacant',
         CONCAT(@actor_name, N' left "', i.idea_title, N'" as team leader. Assign a new leader.'),
         CONCAT(N'/ideas/', LOWER(CONVERT(NVARCHAR(36), i.id)))
    FROM @left l
    JOIN ideas i ON i.id = l.idea_id
    CROSS JOIN (SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id
                 WHERE ro.name IN ('admin', 'developer')) ur
   WHERE l.was_leader = 1;

  COMMIT;
  SELECT COUNT(*) AS left_count FROM @left;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
