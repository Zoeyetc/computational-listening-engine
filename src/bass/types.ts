/** A candidate supplied by the existing, unmodified Melody candidate timeline. */
export type BassCandidate = Readonly<{
  pitchHz: number;
  midiFloat: number;
  score: number;
  periodicity: number;
  salience: number;
  source: 'melody-usable' | 'melody-range-rejected-low';
  sourceRank: number;
}>;

export type BassCandidateFrame = Readonly<{
  time: number;
  candidates: readonly BassCandidate[];
}>;

/** One independent bass decision per candidate frame; null is an explicit abstention. */
export type BassPath = Readonly<{
  version: 1;
  selectedCandidateIndexes: readonly (number | null)[];
  objective: number;
}>;

export type BassEvidenceFrame = Readonly<{
  time: number;
  candidates: readonly BassCandidate[];
  selectedCandidateIndex: number | null;
  selectedPitchHz: number | null;
  selectedMidiFloat: number | null;
  selectedScore: number | null;
  reason: 'SELECTED' | 'NO_CANDIDATE' | 'PATH_ABSTAINED';
}>;

/** Score is candidate support, not a calibrated probability of bass correctness. */
export type BassEvidence = Readonly<{
  version: 1;
  source: 'melody-candidate-evidence-v1';
  frames: readonly BassEvidenceFrame[];
  path: BassPath;
  limitations: Readonly<{
    nominalLowerFrequencyBoundHz: 80;
    upperCandidateFrequencyHz: 330;
    candidatesPrunedByMelody: true;
    voiceSeparation: false;
    calibratedConfidence: false;
  }>;
}>;

/** Lightweight time lookup. No note segmentation or transport events yet. */
export type BassSnapshot = Readonly<{
  time: number;
  available: boolean;
  pitchHz: number | null;
  midiFloat: number | null;
  candidateScore: number | null;
  reason: BassEvidenceFrame['reason'] | 'OUTSIDE_EVIDENCE';
}>;

/** Proposed ground-truth contract. No bass dataset is shipped in v0.1. */
export type BassDataset = Readonly<{
  id: string;
  version: string;
  cases: readonly Readonly<{
    id: string;
    reference: readonly Readonly<{ time: number; midiFloat: number | null }>[];
  }>[];
}>;

/** Result contract reserved for a separate, future evaluator. */
export type BassEvaluation = Readonly<{
  datasetId: string;
  datasetVersion: string;
  evaluatedCases: number;
  pitchAccuracy: number | null;
  centError: number | null;
  voicedF1: number | null;
  pathContinuity: number | null;
}>;
