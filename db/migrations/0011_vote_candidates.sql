-- 0011: Favorite Project voting candidates come from the final presentation stage.
--  * A candidate is a submitted idea whose screening Pass and qualifier Build
--    are both published and which has a final_presentation_assessments row
--    (draft or finalized, published or not, any winner decision). The list is
--    live: an idea entering final presentation joins an open vote immediately.
--  * Showcase content no longer gates voting; it only decorates the ballot.
--  * A voting period is invisible to voters until an admin publishes it
--    (voting_published). Existing periods are backfilled as published so
--    their behaviour is unchanged.
--  * usp_submit_vote now also refuses unpublished periods and non-candidates.

ALTER TABLE voting_periods ADD
  voting_published     BIT               NOT NULL CONSTRAINT df_voting_periods_voting_published DEFAULT 0,
  voting_published_at  DATETIMEOFFSET(3) NULL;
GO

UPDATE voting_periods SET voting_published = 1, voting_published_at = SYSDATETIMEOFFSET();
GO

CREATE OR ALTER VIEW dbo.v_vote_candidates AS
  SELECT i.id AS idea_id, i.program_id
    FROM ideas i
    JOIN final_presentation_assessments fpa ON fpa.idea_id = i.id
    JOIN screening_decisions sd ON sd.idea_id = i.id
    JOIN qualifier_assessments qa ON qa.idea_id = i.id
   WHERE i.status = 'submitted'
     AND sd.decision = 'pass_to_qualifier' AND sd.published = 1
     AND qa.status = 'finalized' AND qa.build_decision = 'build' AND qa.published = 1;
GO

-- ---------------------------------------------------------------------
-- usp_submit_vote: checks the period is published and open, the idea is a
-- candidate of the period's program and the voter isn't on its team, then
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

  DECLARE @found UNIQUEIDENTIFIER, @program_id UNIQUEIDENTIFIER, @published BIT;
  DECLARE @opens DATETIMEOFFSET(3), @closes DATETIMEOFFSET(3);
  DECLARE @now DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();

  SELECT @found = id, @program_id = program_id, @published = voting_published,
         @opens = opens_at, @closes = closes_at
    FROM voting_periods WHERE id = @voting_period_id;

  IF @found IS NULL
    THROW 50001, 'Voting period not found', 1;

  IF @published = 0 OR @now < @opens OR @now > @closes
    THROW 50002, 'Voting is not currently open', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.v_vote_candidates WHERE idea_id = @idea_id AND program_id = @program_id)
    THROW 50011, 'That idea is not a candidate in this vote', 1;

  IF dbo.fn_is_idea_team_member(@idea_id, @voter_id) = 1
    THROW 50010, 'You cannot vote for your own team''s idea', 1;

  INSERT INTO votes (voting_period_id, voter_id, idea_id)
  VALUES (@voting_period_id, @voter_id, @idea_id);
END;
GO
