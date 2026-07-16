import { describe, expect, it } from 'vitest';
import {
  ACTIVE_RUN_STATUSES,
  assertTransition,
  canTransition,
  InvalidRunTransitionError,
  isTerminal,
} from '../src/state-machine';
import { RUN_STATUSES } from '../src/types';

describe('run state machine', () => {
  it('allows the happy path end to end', () => {
    const path = [
      'draft',
      'estimating',
      'awaiting_confirmation',
      'queued',
      'starting',
      'running',
      'ingesting',
      'normalizing',
      'deduplicating',
      'enriching',
      'export_ready',
      'completed',
    ] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it('allows skipping enrichment: deduplicating -> export_ready', () => {
    expect(canTransition('deduplicating', 'export_ready')).toBe(true);
  });

  it('rejects skipping confirmation: draft -> queued', () => {
    expect(canTransition('draft', 'queued')).toBe(false);
    expect(() => assertTransition('draft', 'queued')).toThrow(InvalidRunTransitionError);
  });

  it('rejects any transition out of terminal states', () => {
    for (const to of RUN_STATUSES) {
      expect(canTransition('completed', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });

  it('allows retry from failed and partially_completed via queued', () => {
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('partially_completed', 'queued')).toBe(true);
  });

  it('supports cancellation from in-flight states', () => {
    expect(canTransition('running', 'cancellation_requested')).toBe(true);
    expect(canTransition('ingesting', 'cancellation_requested')).toBe(true);
    expect(canTransition('cancellation_requested', 'cancelled')).toBe(true);
    expect(canTransition('cancellation_requested', 'partially_completed')).toBe(true);
  });

  it('classifies terminal and active statuses consistently', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('failed')).toBe(false); // retriable
    for (const status of ACTIVE_RUN_STATUSES) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});
