-- Migration 0015: Add avatarUrl and stampUrl to doctors table
ALTER TABLE `doctors`
  ADD COLUMN `avatarUrl` TEXT NULL,
  ADD COLUMN `stampUrl` TEXT NULL;
