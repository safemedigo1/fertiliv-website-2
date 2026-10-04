-- Durable outbound reliability metadata for the existing WhatsApp send-attempt ledger.
-- This migration is additive and does not alter provider routing, WU-09, or Meta flows.
ALTER TABLE `whatsapp_send_attempts`
  ADD COLUMN `conversationId` int NULL AFTER `id`,
  MODIFY COLUMN `attemptState` enum('pending','submitting','accepted','delivered','read','failed','ambiguous','requires_retry') NOT NULL DEFAULT 'pending';

CREATE INDEX `whatsapp_send_attempts_conversation_ix`
  ON `whatsapp_send_attempts` (`conversationId`, `createdAt`);
