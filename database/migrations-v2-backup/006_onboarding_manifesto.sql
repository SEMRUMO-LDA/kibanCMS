-- ============================================================
-- kibanCMS - Migration 006: Onboarding & Project Manifesto
-- ============================================================
-- Adds onboarding tracking and project manifesto to profiles

-- Add onboarding fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_manifesto JSONB DEFAULT NULL;

-- Create index for faster onboarding queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON profiles(onboarding_completed);

-- Comment the columns
COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether the user has completed the initial onboarding flow';
COMMENT ON COLUMN profiles.project_manifesto IS 'Project configuration and brand identity (name, colors, description, etc)';

-- Sample manifesto structure (for documentation)
/*
project_manifesto: {
  // Identity
  "name": "My Website",
  "tagline": "Beautiful, fast, and modern",
  "brand_color": "#06B6D4",
  "logo_url": null,

  // Vision
  "description": "A modern CMS for content creators",
  "industry": "Technology",
  "target_audience": "Developers and content creators",

  // Content Strategy
  "collections_preset": ["blog", "projects"],
  "content_goals": ["SEO", "User engagement"],

  // Technical
  "timezone": "Europe/Lisbon",
  "language": "en",
  "media_bucket": "media",

  // Metadata
  "created_at": "2026-04-01T14:00:00Z",
  "version": "1.0"
}
*/
