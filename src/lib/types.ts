/**
 * ChartDataPoint: each date row has `model` (mean), `model_n`, `model_variance`,
 * `model_ci_low`, `model_ci_high`, `model_count` for every tracked model.
 */
export interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface ChartApiResponse {
  data: ChartDataPoint[];
  models: string[];
  total_submissions: number;
  total_scored: number;
  total_contributors: number;
}

export interface ModelStatEntry {
  n: number;
  mean: number;
  variance: number;
  count: number;
}

export interface UserStatsResponse {
  user_id: string;
  total_submissions: number;
  total_scored: number;
  models_tested: string[];
  models_count: number;
  model_stats: Record<string, ModelStatEntry>;
  last_submission: string | null;
}

export interface UserSummaryResponse {
  version: 2;
  date_stats: Record<string, Record<string, { n: number; mean: number; m2: number; count: number }>>;
  model_stats: Record<string, { n: number; mean: number; m2: number; count: number }>;
  total_submissions: number;
  total_scored: number;
}

export interface ModelComparison {
  model: string;
  user_n: number;
  user_mean: number;
  user_variance: number;
  user_ci: { lower: number; upper: number };
  community_n: number;
  community_mean: number;
  community_variance: number;
  community_ci: { lower: number; upper: number };
  welch_t: number | null;
  df: number | null;
  p_value: number | null;
  p_adjusted: number | null;
  cohens_d: number | null;
  effect: string | null;
  significant: boolean;
}

export interface ComparisonApiResponse {
  comparisons: ModelComparison[];
  total_scored: number;
}
