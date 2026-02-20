CREATE TABLE `hr_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hr_chat_session` ON `hr_chat_messages` (`session_id`,`created_at`);