-- 0012: Per-stage "TBA" masking for the participant program timeline.
--  * The timeline now shows four stages (lib/program/timeline.ts), each fed
--    by an existing date column. Admins can hide any stage's real date behind
--    an editable message (default "TBA") until it is announced.
--  * timeline_tba holds JSON keyed by date column:
--      { "<date_column>": { "hidden": true, "text": "TBA" } }
--    NULL means nothing is masked. The real dates still drive the app; only
--    what participants see changes.

ALTER TABLE programs ADD
  timeline_tba NVARCHAR(MAX) NULL CONSTRAINT ck_programs_timeline_tba CHECK (timeline_tba IS NULL OR ISJSON(timeline_tba) = 1);
GO
