-- Migration 0011: Add gender column to leads table
ALTER TABLE leads ADD COLUMN gender ENUM('male', 'female', 'other') NULL;
