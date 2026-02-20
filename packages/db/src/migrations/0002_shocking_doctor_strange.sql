CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `subtasks` ADD `token_usage` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `token_usage` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tools` ADD `access_level` text DEFAULT 'read';