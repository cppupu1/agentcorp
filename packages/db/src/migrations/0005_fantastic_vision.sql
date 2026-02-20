CREATE TABLE `change_test_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`watch_target` text NOT NULL,
	`watch_id` text,
	`scenario_ids` text NOT NULL,
	`enabled` integer DEFAULT 1,
	`last_triggered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `change_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`test_run_id` text,
	`change_type` text NOT NULL,
	`change_detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `change_test_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_change_test_runs_config` ON `change_test_runs` (`config_id`);--> statement-breakpoint
CREATE TABLE `deployment_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`team_id` text,
	`stage` text DEFAULT 'simulation' NOT NULL,
	`promoted_at` text,
	`promoted_by` text,
	`config` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_deployment_stages_employee` ON `deployment_stages` (`employee_id`);--> statement-breakpoint
CREATE INDEX `idx_deployment_stages_team` ON `deployment_stages` (`team_id`);--> statement-breakpoint
CREATE TABLE `stage_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_stage_id` text NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`result` text NOT NULL,
	`metrics` text,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`deployment_stage_id`) REFERENCES `deployment_stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stage_evaluations_deployment` ON `stage_evaluations` (`deployment_stage_id`);--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`test_run_id` text NOT NULL,
	`scenario_id` text NOT NULL,
	`status` text NOT NULL,
	`actual_output` text,
	`score` integer,
	`evaluation` text,
	`duration_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`test_run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `test_scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_test_results_run` ON `test_results` (`test_run_id`);--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`status` text DEFAULT 'pending',
	`trigger_type` text NOT NULL,
	`total_scenarios` integer DEFAULT 0,
	`passed_scenarios` integer DEFAULT 0,
	`failed_scenarios` integer DEFAULT 0,
	`summary` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_test_runs_employee` ON `test_runs` (`employee_id`);--> statement-breakpoint
CREATE TABLE `test_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`input` text NOT NULL,
	`expected_behavior` text NOT NULL,
	`evaluation_criteria` text,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
