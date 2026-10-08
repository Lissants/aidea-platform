-- 0012_reviews_business_impact.sql
-- Adds the "Business impact" Yes/No indicator to mentor reviews.
-- Nullable so existing drafts and submitted reviews stay valid.
-- Guarded so it is a no-op if the column was already added by hand.

IF COL_LENGTH('dbo.reviews', 'business_impact') IS NULL
  ALTER TABLE reviews ADD business_impact BIT NULL;
GO
