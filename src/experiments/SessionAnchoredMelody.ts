/**
 * v0.2 compatibility name for the production-internal observer promoted in v0.3.
 * Benchmarks and feasibility tests keep using the original experimental name.
 */
export {
  RollingMelodyAcousticObserver as SessionAnchoredMelodyExperiment,
  type RollingMelodyAcousticFrame as SessionAnchoredAcousticFrame,
  type RollingMelodyPushResult as SessionAnchoredPushResult,
  type RollingMelodyAcousticDiagnostics as SessionAnchoredDiagnostics,
} from '../streaming/RollingMelodyAcousticObserver.ts';
