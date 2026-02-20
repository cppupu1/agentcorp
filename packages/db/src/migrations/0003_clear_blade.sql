CREATE TABLE `collaboration_configs` (
	`team_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `decision_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`subtask_id` text,
	`employee_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`input` text,
	`output` text,
	`reasoning` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subtask_id`) REFERENCES `subtasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_decision_logs_task` ON `decision_logs` (`task_id`);--> statement-breakpoint
CREATE TABLE `error_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`subtask_id` text NOT NULL,
	`error_type` text NOT NULL,
	`error_message` text NOT NULL,
	`retry_attempt` integer DEFAULT 0,
	`resolution` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subtask_id`) REFERENCES `subtasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_error_traces_task` ON `error_traces` (`task_id`);--> statement-breakpoint
CREATE TABLE `model_pricing` (
	`model_id` text PRIMARY KEY NOT NULL,
	`input_price_per_m_token` integer,
	`output_price_per_m_token` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`task_id` text,
	`read` integer DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_read` ON `notifications` (`read`);--> statement-breakpoint
CREATE INDEX `idx_notifications_created` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `observer_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`observer_id` text NOT NULL,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`related_subtask_id` text,
	`resolution` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_subtask_id`) REFERENCES `subtasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_observer_findings_task` ON `observer_findings` (`task_id`);--> statement-breakpoint
CREATE TABLE `token_usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`subtask_id` text,
	`employee_id` text,
	`model_id` text,
	`input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`estimated_cost` integer DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subtask_id`) REFERENCES `subtasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_task` ON `token_usage_logs` (`task_id`);--> statement-breakpoint
CREATE TABLE `tool_call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`subtask_id` text,
	`employee_id` text,
	`tool_name` text NOT NULL,
	`input` text,
	`output` text,
	`is_error` integer DEFAULT 0,
	`duration_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subtask_id`) REFERENCES `subtasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tool_call_logs_task` ON `tool_call_logs` (`task_id`);--> statement-breakpoint
CREATE TABLE `webhook_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`secret` text,
	`events` text NOT NULL,
	`enabled` integer DEFAULT 1,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `subtasks` ADD `retry_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `subtasks` ADD `max_retries` integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE `subtasks` ADD `validation_result` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `estimated_cost` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `actual_cost` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `budget_limit` integer;