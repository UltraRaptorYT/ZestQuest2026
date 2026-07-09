"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import supabase from "@/lib/supabase";
import {
  SCORE_LOG_TABLE,
  SELECTED_TEAM_STORAGE_KEY,
  TEAM_TABLE,
  type ScoreLog,
  type Team,
} from "@/lib/zestquest";

const scoreButtons = [-1, 1, -5, 5, -10, 10];

export default function AddScore({ admin = false }: { admin?: boolean }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [logs, setLogs] = useState<ScoreLog[]>([]);
  const [teamName, setTeamName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [savingScore, setSavingScore] = useState<number | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const savedTeam = window.localStorage.getItem(SELECTED_TEAM_STORAGE_KEY);
      if (savedTeam) {
        setTeamName(savedTeam);
      }
    });

    async function loadTeams() {
      setLoadingTeams(true);
      const { data, error } = await supabase
        .from(TEAM_TABLE)
        .select("id, team_name, selfie, created_at")
        .order("id", { ascending: true });

      if (error) {
        toast.error("Could not load groups", {
          description: error.message,
        });
      } else {
        setTeams(data ?? []);
        if (data?.[0] && !window.localStorage.getItem(SELECTED_TEAM_STORAGE_KEY)) {
          setTeamName(data[0].team_name);
        }
      }
      setLoadingTeams(false);
    }

    async function loadScores() {
      const { data, error } = await supabase
        .from(SCORE_LOG_TABLE)
        .select("id, team_name, score, added_by, is_admin, remarks, created_at");

      if (error) {
        toast.error("Could not load scores", {
          description: error.message,
        });
      } else {
        setLogs(data ?? []);
      }
    }

    loadTeams();
    loadScores();

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.team_name === teamName),
    [teamName, teams],
  );

  const currentPoints = useMemo(
    () =>
      logs
        .filter((log) => log.team_name === teamName)
        .reduce((total, log) => total + log.score, 0),
    [logs, teamName],
  );

  function handleTeamChange(value: string) {
    setTeamName(value);
    window.localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, value);
  }

  async function addScore(scoreValue: number) {
    if (!selectedTeam || !teamName) {
      toast.error("Select a group first.");
      return;
    }

    setSavingScore(scoreValue);
    const { data, error } = await supabase
      .from(SCORE_LOG_TABLE)
      .insert({
        team_name: selectedTeam.team_name,
        score: scoreValue,
        added_by: admin ? "Admin" : "User",
        is_admin: admin,
        remarks: remarks.trim() || null,
      })
      .select("id, team_name, score, added_by, is_admin, remarks, created_at")
      .single();
    setSavingScore(null);

    if (error) {
      toast.error("Score was not added", {
        description: error.message,
      });
      return;
    }

    if (data) {
      setLogs((currentLogs) => [data, ...currentLogs]);
    }

    setRemarks("");
    toast.success("Score added", {
      description: `${scoreValue > 0 ? "+" : ""}${scoreValue} points for ${
        selectedTeam.team_name
      }.`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Group Name
        <select
          value={teamName}
          onChange={(event) => handleTeamChange(event.target.value)}
          disabled={loadingTeams}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {teams.map((team) => (
            <option key={team.id} value={team.team_name}>
              {team.team_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Remarks
        <textarea
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Optional reason"
          rows={1}
          className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>

      <div className="text-center text-xl">
        Current Points: <span className="font-bold">{currentPoints}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {scoreButtons.map((scoreValue) => (
          <button
            key={scoreValue}
            type="button"
            onClick={() => addScore(scoreValue)}
            disabled={
              savingScore !== null || loadingTeams || teams.length === 0
            }
            className="flex aspect-[3/2] items-center justify-center rounded-lg bg-secondary text-4xl font-semibold transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingScore === scoreValue
              ? "..."
              : scoreValue > 0
                ? `+${scoreValue}`
                : scoreValue}
          </button>
        ))}
      </div>
    </div>
  );
}
