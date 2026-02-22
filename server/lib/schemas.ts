/**
 * Zod schemas — replaces backend/models/schemas.py (Pydantic).
 * Zod is Workers-compatible, no changes needed from lib/schemas.ts.
 */
import { z } from "zod";

export const SubmissionRequestSchema = z.object({
  model_id: z.string().max(256),
  prompt_id: z.string().max(256),
  output: z.string().max(1_048_576),
  score: z.number().min(0).max(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type SubmissionRequest = z.infer<typeof SubmissionRequestSchema>;

export const BatchSubmissionRequestSchema = z.object({
  suite_version: z.string(),
  suite_hash: z.string(),
  model_id: z.string(),
  temperature: z.number(),
  seed: z.number().nullable().optional(),
  timestamp: z.string(),
  results: z.array(SubmissionRequestSchema).max(1000),
});

export type BatchSubmissionRequest = z.infer<
  typeof BatchSubmissionRequestSchema
>;

/** CSV record stored in buffer / archive (12 fields: original 11 + score) */
export interface StorageRecord {
  id: string;
  timestamp: string;
  user_id: string;
  model_id: string;
  prompt_id: string;
  output: string;
  output_hash: string;
  metadata_json: string;
  year: number;
  month: number;
  day: number;
  score: number | null;
}

/** Hash-based output consistency stats for a model on a given day */
export interface ModelDayStats {
  submissions: number;       // total submission records
  prompts_tested: number;    // unique prompt_ids
  unique_outputs: number;    // unique output_hashes across all prompts
  drifted_prompts: number;   // prompts whose hash changed vs previous day
}

/** Aggregated chart data stored as _aggregated/chart_data.json */
export interface ChartJson {
  version: 4;
  data: Record<string, Record<string, ModelDayStats>>;  // date → model → stats
  models: string[];
  total_submissions: number;
  total_contributors: number;
  _prev_hashes: Record<string, string>;   // "model|prompt" → last output_hash
  _known_users: string[];                  // deduplicated contributor list
}

/** Delta record written per submit for incremental chart aggregation */
export interface DeltaRecord {
  model_id: string;
  prompt_id: string;
  output_hash: string;
  user_id: string;
}

/** Delta file written to _deltas/{day}/{timestamp}_{random}.json */
export interface ChartDelta {
  ts: number;         // Date.now()
  day: string;        // "YYYY-MM-DD"
  records: DeltaRecord[];
}

/** Per-user summary stored as _users/{user_id}/summary.json */
export interface UserSummaryJson {
  version: 3;
  submissions_by_date: Record<string, Record<string, number>>;  // date → model → count
  model_submissions: Record<string, number>;                     // model → total
  total_submissions: number;
}
