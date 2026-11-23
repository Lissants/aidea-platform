-- 0018: Committing to one idea waits for the qualifier Build.
--  * v_approved_ideas (0009) now means a submitted idea whose screening Pass
--    AND qualifier Build are both published, instead of screening Pass alone.
--    A person on 2+ such ideas in a program must commit to one. Everything
--    that reads the view moves with it: the commit panel, usp_commit_to_idea,
--    the "already committed" check on new ideas, the profile picker and the
--    admin conflict flag.
--  * usp_commit_to_idea: identical to 0009 except the "not approved" error.
-- CREATE OR ALTER, so the file is safe to re-run.

CREATE OR ALTER VIEW dbo.v_approved_ideas AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
    JOIN screening_decisions sd ON sd.idea_id = i.id
    JOIN qualifier_assessments qa ON qa.idea_id = i.id
   WHERE i.status = 'submitted'
     AND sd.decision = 'pass_to_qualifier' AND sd.published = 1
     AND qa.status = 'finalized' AND qa.build_decision = 'build' AND qa.published = 1;
GO

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

  -- Lock every approved idea of this program the actor is on, so two
  -- concurrent commits by the same person serialize.
  SELECT @locked = COUNT(*) FROM ideas i WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.v_approved_ideas a ON a.idea_id = i.id
   WHERE i.program_id = @program_id
     AND (i.team_leader_id = @actor_id
          OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @actor_id));

  IF NOT EXISTS (SELECT 1 FROM dbo.v_approved_ideas WHERE idea_id = @idea_id)
    THROW 50002, 'You can only commit to an idea that has been marked Build', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.v_idea_participants WHERE idea_id = @idea_id AND profile_id = @actor_id)
    THROW 50003, 'You are not on this idea''s team', 1;

  INSERT INTO @left (idea_id, was_leader)
  SELECT DISTINCT p.idea_id, CASE WHEN p.role = 'leader' THEN 1 ELSE 0 END
    FROM dbo.v_idea_participants p
    JOIN dbo.v_approved_ideas a ON a.idea_id = p.idea_id
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
