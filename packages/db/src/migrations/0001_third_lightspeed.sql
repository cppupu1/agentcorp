PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_employee_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_employee_chat_messages`("id", "employee_id", "session_id", "role", "content", "tool_calls", "created_at") SELECT "id", "employee_id", "session_id", "role", "content", "tool_calls", "created_at" FROM `employee_chat_messages`;--> statement-breakpoint
DROP TABLE `employee_chat_messages`;--> statement-breakpoint
ALTER TABLE `__new_employee_chat_messages` RENAME TO `employee_chat_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_chat_employee_session` ON `employee_chat_messages` (`employee_id`,`session_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_employee_tool` ON `employee_tools` (`employee_id`,`tool_id`);--> statement-breakpoint
CREATE INDEX `idx_subtasks_task` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_messages_task_created` ON `task_messages` (`task_id`,`created_at`);