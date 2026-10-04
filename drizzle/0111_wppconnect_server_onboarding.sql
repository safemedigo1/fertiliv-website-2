-- Additive only: permits the controlled WPPConnect Server provider to be recorded
-- distinctly from the legacy isolated sandbox onboarding method. No rows are
-- deleted or rewritten by this migration.
ALTER TABLE `whatsapp_connections`
  MODIFY COLUMN `onboardingMethod` enum(
    'manual_cloud_api',
    'meta_embedded_signup',
    'meta_coexistence',
    'linked_device_wppconnect_sandbox',
    'linked_device_wppconnect_server'
  ) NOT NULL;
