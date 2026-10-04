-- Disposable Linked Device sessions own infrastructure bindings.
-- This is additive only: no business history, identity, conversation, or message
-- rows are rewritten or deleted.
ALTER TABLE `whatsapp_linked_device_sessions`
  ADD COLUMN `runtimeSlot` varchar(64) NULL,
  ADD COLUMN `runtimeEndpoint` varchar(512) NULL,
  ADD COLUMN `runtimeMode` enum('sandbox','persistent_worker') NULL,
  ADD COLUMN `runtimeGeneration` varchar(64) NULL,
  ADD COLUMN `runtimeProfileRef` varchar(512) NULL,
  ADD COLUMN `runtimeAllocatedAt` timestamp NULL,
  ADD COLUMN `runtimeReleasedAt` timestamp NULL;
