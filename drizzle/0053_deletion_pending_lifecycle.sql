-- Migration 0053: Add 'deletion-pending' to lifecycleStatus enum
-- Documents in this state are being permanently deleted but S3 deletion has not yet succeeded.
-- They are hidden from user-facing lists but preserved for retry.
ALTER TABLE `lead_documents`
  MODIFY COLUMN `lifecycleStatus` ENUM('active','historical','direct-upload','deletion-pending') NULL DEFAULT NULL;
