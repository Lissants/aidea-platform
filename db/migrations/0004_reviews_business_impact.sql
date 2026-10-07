-- 0004_reviews_business_impact.sql
-- Adds the "Business impact" Yes/No indicator to mentor reviews.
-- Nullable so existing drafts and submitted reviews stay valid.

ALTER TABLE reviews ADD business_impact BIT NULL;
GO
