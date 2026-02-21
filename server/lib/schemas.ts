/**
 * Zod schemas — replaces backend/models/schemas.py (Pydantic).
 * Zod is Workers-compatible, no changes needed from lib/schemas.ts.
 */
import { z } from "zod";

export const SubmissionRequestSchema = z.object({
  model_id: z.string().max(256),
  prompt_id: z.string().max(256),
  output: z.string().max(1_048_576),
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

/** CSV record stored in buffer / archive */
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
}

/** Aggregated chart data stored as _aggregated/chart_data.json */
export interface ChartJson {
  data: Record<string, Record<string, number>>;
  models: string[];
  total_submissions: number;
}

/** Per-user summary stored as _users/{user_id}/summary.json */
export interface UserSummaryJson {
  date_counts: Record<string, Record<string, number>>;
  total_submissions: number;
}
