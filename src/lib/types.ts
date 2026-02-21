export interface ChartDataPoint {
  date: string;
  [model: string]: string | number;
}

export interface ChartApiResponse {
  data: ChartDataPoint[];
  models: string[];
  total_submissions: number;
}

export interface UserStatsResponse {
  user_id: string;
  total_submissions: number;
  models_tested: string[];
  models_count: number;
  last_submission: string | null;
}

export interface UserSummaryResponse {
  date_counts: Record<string, Record<string, number>>;
  total_submissions: number;
}
