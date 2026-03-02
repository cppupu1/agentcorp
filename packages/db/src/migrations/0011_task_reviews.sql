CREATE TABLE `task_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
	`status` text DEFAULT 'pending' NOT NULL,
	`summary` text,
	`total_findings` integer DEFAULT 0,
	`triggered_by` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_task_reviews_task` ON `task_reviews` (`task_id`);
--> statement-breakpoint
CREATE TABLE `task_review_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL REFERENCES `task_reviews`(`id`) ON DELETE CASCADE,
	`task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`suggestion` text,
	`related_subtask_id` text REFERENCES `subtasks`(`id`),
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_task_review_findings_review` ON `task_review_findings` (`review_id`);
--> statement-breakpoint
CREATE INDEX `idx_task_review_findings_task` ON `task_review_findings` (`task_id`);
--> statement-breakpoint
CREATE INDEX `idx_task_review_findings_category` ON `task_review_findings` (`category`);
