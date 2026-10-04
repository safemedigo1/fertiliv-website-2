ALTER TABLE `leads` ADD COLUMN `leadOrigin` enum('staff-created','self-submitted') DEFAULT 'staff-created';
