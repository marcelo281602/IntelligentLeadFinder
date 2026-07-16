import type { RunStatus } from './types';

/**
 * Search-run state machine (Module 5). Every transition validates its
 * allowed previous state; the worker and API both call assertTransition
 * before persisting a status change inside a transaction.
 */

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  draft: ['estimating', 'cancelled'],
  estimating: ['awaiting_confirmation', 'draft', 'failed'],
  awaiting_confirmation: ['queued', 'draft', 'estimating', 'cancelled'],
  queued: ['starting', 'cancelled'],
  starting: ['running', 'failed', 'cancellation_requested'],
  running: ['ingesting', 'partially_completed', 'failed', 'cancellation_requested'],
  ingesting: ['normalizing', 'partially_completed', 'failed', 'cancellation_requested'],
  normalizing: ['deduplicating', 'failed'],
  deduplicating: ['enriching', 'export_ready', 'failed'],
  enriching: ['export_ready', 'partially_completed', 'failed', 'cancellation_requested'],
  export_ready: ['completed', 'partially_completed'],
  completed: [],
  partially_completed: ['queued'], // retry failed stage re-enqueues
  cancellation_requested: ['cancelled', 'partially_completed', 'failed'],
  cancelled: [],
  failed: ['queued'], // retry re-enqueues; resume checkpoint is stored on the run
};

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ['completed', 'cancelled'];

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidRunTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Invalid run transition: ${from} -> ${to}`);
    this.name = 'InvalidRunTransitionError';
  }
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new InvalidRunTransitionError(from, to);
}

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

/** Statuses that count as "in flight" for duplicate-start protection. */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = [
  'queued',
  'starting',
  'running',
  'ingesting',
  'normalizing',
  'deduplicating',
  'enriching',
  'cancellation_requested',
];
