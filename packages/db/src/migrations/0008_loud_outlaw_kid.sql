CREATE TABLE `employee_competency_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period` text NOT NULL,
	`completion_rate` integer,
	`quality_score` integer,
	`efficiency_score` integer,
	`stability_score` integer,
	`overall_score` integer,
	`task_count` integer DEFAULT 0,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_competency_scores_employee` ON `employee_competency_scores` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_competency_employee_period` ON `employee_competency_scores` (`employee_id`,`period`);--> statement-breakpoint
CREATE TABLE `employee_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`source_task_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`tags` text,
	`confidence` integer DEFAULT 50,
	`usage_count` integer DEFAULT 0,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_employee_memories_employee` ON `employee_memories` (`employee_id`);--> statement-breakpoint
CREATE TABLE `improvement_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`category` text NOT NULL,
	`diagnosis` text NOT NULL,
	`suggestion` text NOT NULL,
	`status` text DEFAULT 'pending',
	`applied_at` text,
	`test_run_id` text,
	`source_data` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`source_task_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_team_memories_team` ON `team_memories` (`team_id`);