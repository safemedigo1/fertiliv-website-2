ALTER TABLE `services` ADD `taxOverrideMode` enum('inherit','rule','no_tax') NOT NULL DEFAULT 'inherit';
--> statement-breakpoint
ALTER TABLE `services` ADD `taxOverrideRuleId` int;
