-- Migration 065: Add pending_execution to project_status ENUM
-- Resolves fatal crash during matchmaking bid acceptance (MEMO 83)

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'pending_execution' AFTER 'published';
