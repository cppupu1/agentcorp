import type { CollaborationStrategy } from './types.js';
import { PipelineStrategy } from './pipeline.js';
import { DebateStrategy } from './debate.js';
import { VoteStrategy } from './vote.js';
import { MasterSlaveStrategy } from './master-slave.js';

export function getCollaborationStrategy(mode: string): CollaborationStrategy | null {
  switch (mode) {
    case 'pipeline': return new PipelineStrategy();
    case 'debate': return new DebateStrategy();
    case 'vote': return new VoteStrategy();
    case 'master_slave': return new MasterSlaveStrategy();
    default: return null;
  }
}

export type { CollaborationStrategy, CollaborationContext } from './types.js';
