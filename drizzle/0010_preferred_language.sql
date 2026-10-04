-- Add preferredLanguage to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferredLanguage ENUM('en','ar','tr','fr','es','ru','it','other') DEFAULT 'en';
