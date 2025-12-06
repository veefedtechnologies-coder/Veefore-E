-- Composite indexes for hot queries

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid);

-- Workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces (user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_default ON workspaces (is_default);

-- Social Accounts
CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace_platform ON social_accounts (workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_social_accounts_username ON social_accounts (username);
CREATE INDEX IF NOT EXISTS idx_social_accounts_updated_at ON social_accounts (updated_at);

-- Creative Briefs
CREATE INDEX IF NOT EXISTS idx_creative_briefs_workspace_status ON creative_briefs (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_created_at ON creative_briefs (created_at);

-- Content Repurposes
CREATE INDEX IF NOT EXISTS idx_content_repurposes_workspace_platform ON content_repurposes (workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_content_repurposes_created_at ON content_repurposes (created_at);

-- Competitor Analyses
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_workspace_platform ON competitor_analyses (workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_last_scraped ON competitor_analyses (last_scraped);

-- Trend Calendar
CREATE INDEX IF NOT EXISTS idx_trend_calendar_workspace_trend_date ON trend_calendar (workspace_id, trend_date);
CREATE INDEX IF NOT EXISTS idx_trend_calendar_platform ON trend_calendar (platform);

-- A/B Tests
CREATE INDEX IF NOT EXISTS idx_ab_tests_workspace_platform_type ON ab_tests (workspace_id, platform, test_type);
CREATE INDEX IF NOT EXISTS idx_ab_tests_created_at ON ab_tests (created_at);
