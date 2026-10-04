-- Safe outbound correlation and runtime-selection metadata for synthetic WhatsApp sends.
-- Historical rows remain nullable and immutable. No message body, recipient/JID,
-- approval proof, HMAC, secret, QR, cookies, or raw provider payload is stored.
ALTER TABLE `whatsapp_send_attempts`
  ADD COLUMN `correlationId` varchar(64) NULL,
  ADD COLUMN `lineId` int NULL,
  ADD COLUMN `sessionName` varchar(64) NULL,
  ADD COLUMN `runtimeEndpointHost` varchar(255) NULL,
  ADD COLUMN `runtimeMode` enum('sandbox','persistent_worker') NULL,
  ADD COLUMN `runtimeGateValue` boolean NULL,
  ADD COLUMN `approvalSecretSelector` varchar(64) NULL,
  ADD COLUMN `approvalProofVersion` int NULL,
  ADD COLUMN `approvalExpiryState` varchar(32) NULL,
  ADD COLUMN `recipientFingerprint` varchar(64) NULL,
  ADD COLUMN `approvalReason` varchar(64) NULL;
CREATE INDEX `whatsapp_send_attempts_correlation_ix`
  ON `whatsapp_send_attempts` (`correlationId`, `createdAt`);
