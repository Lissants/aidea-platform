-- 0009: Team membership rules.
--  * Before approval a person may lead / be a member of any number of ideas.
--  * "Approved" = screening decision 'pass_to_qualifier' that has been published.
--    A person on 2+ approved ideas in a program must commit to one
--    (usp_commit_to_idea) and is dropped from the others.
--  * Admins can remove a team member from a submitted idea and assign a
--    replacement / new leader (usp_admin_remove_team_member, usp_admin_add_team_member).
--  * ideas.team_leader_id becomes nullable: NULL = leader slot vacant.
--  * "On an idea" means team leader or team member; created_by is not a team role.

ALTER TABLE ideas DROP CONSTRAINT fk_ideas_team_leader;
GO
ALTER TABLE ideas ALTER COLUMN team_leader_id UNIQUEIDENTIFIER NULL;
GO
ALTER TABLE ideas ADD CONSTRAINT fk_ideas_team_leader FOREIGN KEY (team_leader_id) REFERENCES profiles (id);
CREATE INDEX idx_ideas_team_leader_id ON ideas (team_leader_id);
GO

CREATE OR ALTER VIEW dbo.v_idea_participants AS
  SELECT i.id AS idea_id, i.program_id, i.status, i.team_leader_id AS profile_id, CAST('leader' AS NVARCHAR(10)) AS role
    FROM ideas i
   WHERE i.team_leader_id IS NOT NULL
  UNION ALL
  SELECT i.id, i.program_id, i.status, m.profile_id, CAST('member' AS NVARCHAR(10))
    FROM idea_team_members m JOIN ideas i ON i.id = m.idea_id;
GO

CREATE OR ALTER VIEW dbo.v_approved_ideas AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
    JOIN screening_decisions sd ON sd.idea_id = i.id
   WHERE sd.decision = 'pass_to_qualifier' AND sd.published = 1;
GO

-- ---------------------------------------------------------------------
-- usp_commit_to_idea: the actor keeps @idea_id and leaves every other
-- approved idea of the same program. Leaving as leader vacates the slot.
-- Re-running once nothing is left to resolve is a no-op.
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

  -- Lock every approved idea of this program the actor is on, so two
  -- concurrent commits by the same person serialize.
  SELECT @locked = COUNT(*) FROM ideas i WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.v_approved_ideas a ON a.idea_id = i.id
   WHERE i.program_id = @program_id
     AND (i.team_leader_id = @actor_id
          OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @actor_id));

  IF NOT EXISTS (SELECT 1 FROM dbo.v_approved_ideas WHERE idea_id = @idea_id)
    THROW 50002, 'You can only commit to an idea that has passed screening', 1;

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

-- ---------------------------------------------------------------------
-- usp_admin_remove_team_member: removes a member (or vacates the leader
-- slot) on a submitted idea, e.g. after a resignation. Not automatic: the
-- replacement is assigned separately with usp_admin_add_team_member.
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_admin_remove_team_member
  @idea_id    UNIQUEIDENTIFIER,
  @profile_id UNIQUEIDENTIFIER,
  @reason     NVARCHAR(500),
  @actor_id   UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @status NVARCHAR(40), @program_id UNIQUEIDENTIFIER, @leader UNIQUEIDENTIFIER, @title NVARCHAR(400);
  DECLARE @was_leader BIT = 0, @name NVARCHAR(200);

  IF dbo.fn_has_role(@actor_id, 'admin') = 0
    THROW 50003, 'Only an admin can change a submitted team', 1;
  IF LEN(LTRIM(RTRIM(ISNULL(@reason, '')))) = 0
    THROW 50002, 'A reason is required', 1;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @status = status, @program_id = program_id, @leader = team_leader_id, @title = idea_title
    FROM ideas WITH (UPDLOCK, HOLDLOCK) WHERE id = @idea_id;
  IF @status IS NULL
    THROW 50001, 'Idea not found', 1;
  IF @status <> 'submitted'
    THROW 50002, 'Team changes by an admin are only for submitted ideas', 1;

  IF @leader = @profile_id
  BEGIN
    UPDATE ideas SET team_leader_id = NULL WHERE id = @idea_id;
    SET @was_leader = 1;
  END
  ELSE IF EXISTS (SELECT 1 FROM idea_team_members WHERE idea_id = @idea_id AND profile_id = @profile_id)
    DELETE FROM idea_team_members WHERE idea_id = @idea_id AND profile_id = @profile_id;
  ELSE
    THROW 50002, 'That person is not on this idea''s team', 1;

  SELECT @name = full_name FROM profiles WHERE id = @profile_id;

  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, prior_value, reason)
  VALUES (@program_id, 'idea', @idea_id, @actor_id, 'team_member_removed',
          CONCAT(N'{"profile_id":"', LOWER(CONVERT(NVARCHAR(36), @profile_id)), N'","role":"',
                 IIF(@was_leader = 1, N'leader', N'member'), N'"}'),
          @reason);

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (@profile_id, 'team_member_removed', 'You were removed from a team',
          CONCAT(N'An admin removed you from "', @title, N'".'), '/my-ideas');

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT r.user_id, 'team_member_removed', 'Team change',
         CONCAT(@name, N' was removed from "', @title, N'" by an admin.',
                IIF(@was_leader = 1, N' The team leader slot is now vacant.', N'')),
         '/my-ideas'
    FROM (
      SELECT created_by AS user_id FROM ideas WHERE id = @idea_id
      UNION SELECT team_leader_id FROM ideas WHERE id = @idea_id AND team_leader_id IS NOT NULL
      UNION SELECT profile_id FROM idea_team_members WHERE idea_id = @idea_id
    ) r
   WHERE r.user_id <> @profile_id;

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

-- ---------------------------------------------------------------------
-- usp_admin_add_team_member: adds a replacement member, or fills a vacant
-- leader slot (promoting an existing member or bringing someone in).
-- People from outside the team must not be on any submitted idea in the
-- program, unless @override = 1 with a reason (audited).
-- ---------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_admin_add_team_member
  @idea_id    UNIQUEIDENTIFIER,
  @profile_id UNIQUEIDENTIFIER,
  @as_leader  BIT,
  @override   BIT,
  @reason     NVARCHAR(500),
  @actor_id   UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @status NVARCHAR(40), @program_id UNIQUEIDENTIFIER, @leader UNIQUEIDENTIFIER, @title NVARCHAR(400);
  DECLARE @is_member BIT = 0, @next_order INT, @conflict NVARCHAR(400);

  IF dbo.fn_has_role(@actor_id, 'admin') = 0
    THROW 50003, 'Only an admin can change a submitted team', 1;

  BEGIN TRY
  BEGIN TRAN;

  SELECT @status = status, @program_id = program_id, @leader = team_leader_id, @title = idea_title
    FROM ideas WITH (UPDLOCK, HOLDLOCK) WHERE id = @idea_id;
  IF @status IS NULL
    THROW 50001, 'Idea not found', 1;
  IF @status <> 'submitted'
    THROW 50002, 'Team changes by an admin are only for submitted ideas', 1;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = @profile_id AND active = 1)
    THROW 50002, 'That person is not an active employee', 1;

  IF @leader = @profile_id
    THROW 50002, 'That person is already the team leader', 1;
  IF EXISTS (SELECT 1 FROM idea_team_members WHERE idea_id = @idea_id AND profile_id = @profile_id)
    SET @is_member = 1;

  IF ISNULL(@as_leader, 0) = 1
  BEGIN
    IF @leader IS NOT NULL
      THROW 50002, 'This idea already has a team leader. Remove the current leader first.', 1;
  END
  ELSE
  BEGIN
    IF @is_member = 1
      THROW 50002, 'That person is already on this team', 1;
    IF (SELECT COUNT(*) FROM idea_team_members WHERE idea_id = @idea_id) >= 5
      THROW 50002, 'A team can have at most 5 members', 1;
  END;

  -- Outsiders must be free: not on any submitted idea in this program.
  IF @is_member = 0
  BEGIN
    SELECT TOP (1) @conflict = i.idea_title
      FROM dbo.v_idea_participants p JOIN ideas i ON i.id = p.idea_id
     WHERE p.profile_id = @profile_id AND p.program_id = @program_id
       AND p.status = 'submitted' AND p.idea_id <> @idea_id;
    IF @conflict IS NOT NULL AND ISNULL(@override, 0) = 0
    BEGIN
      DECLARE @msg NVARCHAR(600) = CONCAT(N'That person is already on the submitted idea "', @conflict, N'"');
      THROW 50002, @msg, 1;
    END;
    IF @conflict IS NOT NULL AND LEN(LTRIM(RTRIM(ISNULL(@reason, '')))) = 0
      THROW 50002, 'A reason is required to override eligibility', 1;
  END;

  IF ISNULL(@as_leader, 0) = 1
  BEGIN
    IF @is_member = 1
      DELETE FROM idea_team_members WHERE idea_id = @idea_id AND profile_id = @profile_id;
    UPDATE ideas SET team_leader_id = @profile_id WHERE id = @idea_id;
  END
  ELSE
  BEGIN
    SELECT @next_order = ISNULL(MAX(member_order), 0) + 1 FROM idea_team_members WHERE idea_id = @idea_id;
    INSERT INTO idea_team_members (idea_id, profile_id, member_order) VALUES (@idea_id, @profile_id, @next_order);
  END;

  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value, reason)
  VALUES (@program_id, 'idea', @idea_id, @actor_id,
          CASE WHEN ISNULL(@as_leader, 0) = 1 THEN 'team_leader_assigned' ELSE 'team_member_added' END,
          CONCAT(N'{"profile_id":"', LOWER(CONVERT(NVARCHAR(36), @profile_id)),
                 N'","promoted_from_member":', IIF(@is_member = 1, N'true', N'false'),
                 N',"eligibility_override":', IIF(@conflict IS NOT NULL, N'true', N'false'), N'}'),
          NULLIF(LTRIM(RTRIM(@reason)), ''));

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (@profile_id, 'team_member_added',
          IIF(ISNULL(@as_leader, 0) = 1, N'You are now a team leader', N'You were added to a team'),
          CONCAT(N'An admin made you ', IIF(ISNULL(@as_leader, 0) = 1, N'team leader of', N'a team member of'),
                 N' "', @title, N'".'),
          '/my-ideas');

  COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

-- usp_publish_batch: identical to 0006 except a vacant (NULL) team leader
-- is skipped when notifying the team.
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
  ELSE IF @entity_type = 'showcase_project'
  BEGIN
    UPDATE sp SET published = 1, published_at = @now
    OUTPUT inserted.id, inserted.idea_id INTO @updated
      FROM showcase_projects sp
     WHERE sp.program_id = @program_id AND sp.published = 0;
    SELECT @title = 'Showcase project published',
           @body = 'Your project is now live on the Project Showcase.',
           @link = '/my-ideas';
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
