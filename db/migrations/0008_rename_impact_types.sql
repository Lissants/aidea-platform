-- 0008_rename_impact_types.sql
-- Renames two impact types: cost_efficiency -> cost_optimization and
-- governance_improvement -> governance_excellence. The CHECK constraint must be
-- dropped before the data is updated, then re-added with the new values.

ALTER TABLE idea_impacts DROP CONSTRAINT ck_idea_impacts_type;
GO

UPDATE idea_impacts SET impact_type = 'cost_optimization' WHERE impact_type = 'cost_efficiency';
UPDATE idea_impacts SET impact_type = 'governance_excellence' WHERE impact_type = 'governance_improvement';
GO

ALTER TABLE idea_impacts ADD CONSTRAINT ck_idea_impacts_type CHECK (impact_type IN (
  'revenue_growth', 'time_efficiency', 'cost_optimization', 'governance_excellence'));
GO
