export const TEAM_TABLE = "zestquest_26_team";
export const SCORE_LOG_TABLE = "zestquest_26_score_log";
export const SCOREBOARD_STATE_TABLE = "zestquest_26_scoreboard_state";
export const GROUP_SELFIES_BUCKET = "zestquest-26-group-selfies";
export const SELECTED_TEAM_STORAGE_KEY = "zestquest_26_selected_team";

export type Team = {
  id: number;
  team_name: string;
  selfie: string | null;
  created_at: string;
};

export type ScoreLog = {
  id: number;
  team_name: string;
  score: number;
  added_by: string;
  is_admin: boolean;
  remarks: string | null;
  created_at: string;
};

export type ScoreboardState = {
  id: number;
  is_frozen: boolean;
  frozen_at: string | null;
  updated_at: string;
};
