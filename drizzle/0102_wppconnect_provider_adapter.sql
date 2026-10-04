-- WPPConnect Linked Device adapter boundary.
-- Additive enum widening only: Meta remains the default and all existing Meta rows
-- retain their current values. Production routing stays feature-flagged off.

ALTER TABLE `whatsapp_connections`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_connections`
  MODIFY COLUMN `onboardingMethod` enum('manual_cloud_api','meta_embedded_signup','meta_coexistence','linked_device_wppconnect_sandbox') NOT NULL;

ALTER TABLE `whatsapp_send_attempts`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_provider_event_batches`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_provider_events`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_normalized_messages`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_normalized_statuses`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_normalized_media`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_communication_endpoints`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_endpoint_resolutions`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_conversations`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';

ALTER TABLE `whatsapp_conversation_messages`
  MODIFY COLUMN `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta';
