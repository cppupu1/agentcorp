export interface TeamMemberConfig {
  id: string;
  name: string;
  taskPrompt?: string;
}

export interface TeamConfig {
  pm?: { id: string; name: string };
  members?: TeamMemberConfig[];
}

export interface CollaborationContext {
  taskId: string;
  teamId: string;
  brief: Record<string, unknown>;
  plan: Record<string, unknown>;
  teamConfig: TeamConfig;
  signal: AbortSignal;
}

export interface CollaborationStrategy {
  execute(context: CollaborationContext): Promise<void>;
}
