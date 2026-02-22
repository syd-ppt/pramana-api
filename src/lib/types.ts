/**
 * ChartDataPoint: each date row has `model` (submissions count),
 * `model_prompts`, `model_unique_outputs`, `model_drifted`, `model_consistency`
 * for every tracked model.
 */
export interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface ChartApiResponse {
  data: ChartDataPoint[];
  models: string[];
  total_submissions: number;
  total_contributors: number;
}

export interface UserStatsResponse {
  user_id: string;
  total_submissions: number;
  models_tested: string[];
  models_count: number;
  model_submissions: Record<string, number>;
  last_submission: string | null;
}

export interface UserSummaryResponse {
  version: 3;
  submissions_by_date: Record<string, Record<string, number>>;
  model_submissions: Record<string, number>;
  total_submissions: number;
}
