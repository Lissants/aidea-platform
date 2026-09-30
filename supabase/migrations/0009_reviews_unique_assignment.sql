-- 0009_reviews_unique_assignment.sql
--
-- Bug fix (foundation gap found while building Phase 4): `reviews` had no
-- uniqueness constraint on review_assignment_id, so nothing stopped a
-- mentor ending up with two review rows for the same assignment (one from
-- an initial save, another from a later "start review" click). The
-- reopen/version workflow (fn_reopen_review) assumes exactly one review
-- row per assignment that flips between draft/submitted/reopened in place
-- — this makes that assumption hold, and lets the mentor-review service use
-- a plain upsert-by-review_assignment_id instead of racy select-then-insert
-- logic.
do $$ begin
  alter table reviews
    add constraint uq_reviews_review_assignment_id unique (review_assignment_id);
exception when duplicate_object then null; end $$;
