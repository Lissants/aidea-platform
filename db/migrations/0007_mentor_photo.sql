-- 0007_mentor_photo.sql
-- Mentor-only profile photo shown on the participant-facing Mentor Profile
-- page and the admin Mentor Directory. Deliberately separate from
-- profiles.avatar_url so the mentor's own header avatar is unaffected.
-- Holds a relative /api/files/mentor-photos/... URL (lib/storage/local.ts).

ALTER TABLE mentor_profiles ADD photo_url NVARCHAR(1000) NULL;
GO
