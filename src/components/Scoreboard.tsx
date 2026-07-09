"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Crown, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import supabase from "@/lib/supabase";
import {
  SCORE_LOG_TABLE,
  SCOREBOARD_STATE_TABLE,
  TEAM_TABLE,
  type ScoreboardState,
  type ScoreLog,
  type Team,
} from "@/lib/zestquest";
import { cn } from "@/lib/utils";

type TeamScore = {
  order: number;
  teamName: string;
  selfie: string | null;
  total: number;
  lastUpdated: string | null;
  reachedCurrentScoreAt: string | null;
};

export default function Scoreboard({ admin = false }: { admin?: boolean }) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const previousRects = useRef(new Map<string, DOMRect>());
  const [teams, setTeams] = useState<Team[]>([]);
  const [logs, setLogs] = useState<ScoreLog[]>([]);
  const [scoreboardState, setScoreboardState] =
    useState<ScoreboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingFreeze, setSavingFreeze] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadScoreboard() {
      setLoading(true);
      const [teamsResult, scoresResult, stateResult] = await Promise.all([
        supabase
          .from(TEAM_TABLE)
          .select("id, team_name, selfie, created_at")
          .order("id", { ascending: true }),
        supabase
          .from(SCORE_LOG_TABLE)
          .select(
            "id, team_name, score, added_by, is_admin, remarks, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from(SCOREBOARD_STATE_TABLE)
          .select("id, is_frozen, frozen_at, updated_at")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (teamsResult.error) {
        setError(teamsResult.error.message);
      } else {
        setTeams(teamsResult.data ?? []);
      }

      if (scoresResult.error) {
        setError(scoresResult.error.message);
      } else {
        setLogs(scoresResult.data ?? []);
      }

      if (stateResult.error) {
        setError(stateResult.error.message);
      } else {
        setScoreboardState(
          stateResult.data ?? {
            id: 1,
            is_frozen: false,
            frozen_at: null,
            updated_at: new Date().toISOString(),
          },
        );
      }
      setLoading(false);
    }

    loadScoreboard();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("zestquest-26-scoreboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: SCORE_LOG_TABLE },
        (payload) => {
          setLogs((currentLogs) => {
            const newLog = payload.new as ScoreLog;
            if (currentLogs.some((log) => log.id === newLog.id)) {
              return currentLogs;
            }

            return [newLog, ...currentLogs];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: SCOREBOARD_STATE_TABLE },
        (payload) => {
          setScoreboardState(payload.new as ScoreboardState);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: TEAM_TABLE },
        (payload) => {
          const updatedTeam = payload.new as Team;
          setTeams((currentTeams) =>
            currentTeams.map((team) =>
              team.id === updatedTeam.id ? updatedTeam : team,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const scores = useMemo(() => {
    const byTeam = new Map<string, TeamScore>();

    teams.forEach((team, index) => {
      byTeam.set(team.team_name, {
        order: index,
        teamName: team.team_name,
        selfie: team.selfie,
        total: 0,
        lastUpdated: null,
        reachedCurrentScoreAt: null,
      });
    });

    const visibleLogs =
      scoreboardState?.is_frozen && scoreboardState.frozen_at
        ? logs.filter((log) => log.created_at <= scoreboardState.frozen_at!)
        : logs;
    const chronologicalLogs = [...visibleLogs].sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        a.id.toString().localeCompare(b.id.toString()),
    );

    for (const log of chronologicalLogs) {
      const current = byTeam.get(log.team_name);
      if (current) {
        current.total += log.score;
        current.lastUpdated = log.created_at;
        current.reachedCurrentScoreAt = log.created_at;
      } else {
        byTeam.set(log.team_name, {
          order: byTeam.size,
          teamName: log.team_name,
          selfie: null,
          total: log.score,
          lastUpdated: log.created_at,
          reachedCurrentScoreAt: log.created_at,
        });
      }
    }

    return Array.from(byTeam.values()).sort((a, b) => {
      const scoreDifference = b.total - a.total;
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      if (a.total !== 0 && a.reachedCurrentScoreAt && b.reachedCurrentScoreAt) {
        return a.reachedCurrentScoreAt.localeCompare(b.reachedCurrentScoreAt);
      }

      return a.order - b.order;
    });
  }, [logs, scoreboardState, teams]);

  const podiumScores = scores.slice(0, 3);
  const remainingScores = scores.slice(3);
  const scoreOrderKey = scores
    .map((score) => `${score.teamName}:${score.total}`)
    .join("|");
  const ignoredScoreCount =
    scoreboardState?.is_frozen && scoreboardState.frozen_at
      ? logs.filter((log) => log.created_at > scoreboardState.frozen_at!).length
      : 0;

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();

    itemRefs.current.forEach((element, key) => {
      nextRects.set(key, element.getBoundingClientRect());
    });

    nextRects.forEach((nextRect, key) => {
      const element = itemRefs.current.get(key);
      const previousRect = previousRects.current.get(key);

      if (!element || !previousRect) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 500,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        },
      );
    });

    previousRects.current = nextRects;
  }, [scoreOrderKey]);

  function setItemRef(teamName: string) {
    return (element: HTMLDivElement | null) => {
      if (element) {
        itemRefs.current.set(teamName, element);
      } else {
        itemRefs.current.delete(teamName);
      }
    };
  }

  async function toggleFreeze() {
    if (!admin || savingFreeze) {
      return;
    }

    const shouldFreeze = !scoreboardState?.is_frozen;
    const frozenAt = shouldFreeze ? new Date().toISOString() : null;

    setSavingFreeze(true);
    const { data, error } = await supabase
      .from(SCOREBOARD_STATE_TABLE)
      .update({
        is_frozen: shouldFreeze,
        frozen_at: frozenAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("id, is_frozen, frozen_at, updated_at")
      .single();
    setSavingFreeze(false);

    if (error) {
      toast.error("Could not update leaderboard", {
        description: error.message,
      });
      return;
    }

    setScoreboardState(data);
    toast.success(shouldFreeze ? "Leaderboard frozen" : "Leaderboard live", {
      description: shouldFreeze
        ? "Scores added after this moment will be ignored."
        : "All scores are included again.",
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading scores...</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-center">
        <h1 className="text-2xl font-bold">ZestQuest 2026</h1>
        <p
          className={cn(
            "text-xs text-muted-foreground",
            scoreboardState?.is_frozen ? "opacity-100" : "opacity-0",
          )}
        >
          Frozen at{" "}
          {scoreboardState?.frozen_at
            ? new Date(scoreboardState.frozen_at).toLocaleString()
            : "current standings"}
          {ignoredScoreCount > 0
            ? `, ignoring ${ignoredScoreCount} newer scores`
            : ""}
        </p>
      </div>

      {scores.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No scores logged yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 items-end gap-2 pt-6">
            <PodiumPlace
              score={podiumScores[1]}
              place={2}
              height="h-24"
              setItemRef={setItemRef}
            />
            <PodiumPlace
              score={podiumScores[0]}
              place={1}
              height="h-32"
              setItemRef={setItemRef}
            />
            <PodiumPlace
              score={podiumScores[2]}
              place={3}
              height="h-20"
              setItemRef={setItemRef}
            />
          </div>

          {remainingScores.length > 0 ? (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg bg-secondary/80 p-3">
              {remainingScores.map((score, index) => (
                <div
                  key={score.teamName}
                  ref={setItemRef(score.teamName)}
                  className="grid grid-cols-[2rem_2.5rem_1fr_auto] items-center gap-3 border-b border-border/50 py-3 last:border-b-0"
                >
                  <span className="text-sm font-semibold text-muted-foreground">
                    {index + 4}
                  </span>
                  <Avatar selfie={score.selfie} alt={score.teamName} />
                  <span className="truncate font-medium">{score.teamName}</span>
                  <span className="font-semibold">{score.total}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {admin ? (
        <Button
          type="button"
          variant={scoreboardState?.is_frozen ? "default" : "outline"}
          onClick={toggleFreeze}
          disabled={savingFreeze}
          className="fixed bottom-4 right-4"
        >
          {scoreboardState?.is_frozen ? <Unlock /> : <Lock />}
          {savingFreeze
            ? "Saving..."
            : scoreboardState?.is_frozen
              ? "Unfreeze Leaderboard"
              : "Freeze Leaderboard"}
        </Button>
      ) : null}

      {admin && logs.length > 0 ? (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-semibold">
            Score log
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{log.team_name}</span>
                  <span>{log.score}</span>
                </div>
                <p className="text-muted-foreground">
                  By {log.added_by} ({log.is_admin ? "admin" : "non-admin"})
                </p>
                {log.remarks ? (
                  <p className="mt-1 text-muted-foreground">{log.remarks}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PodiumPlace({
  score,
  place,
  height,
  setItemRef,
}: {
  score?: TeamScore;
  place: 1 | 2 | 3;
  height: string;
  setItemRef: (teamName: string) => (element: HTMLDivElement | null) => void;
}) {
  const ringColor =
    place === 1
      ? "border-yellow-300"
      : place === 2
        ? "border-slate-300"
        : "border-orange-300";

  return (
    <div
      ref={score ? setItemRef(score.teamName) : undefined}
      className="flex min-w-0 flex-col items-center"
    >
      <div className="relative mb-2">
        {place === 1 ? (
          <Crown className="absolute -top-7 left-1/2 size-6 -translate-x-1/2 text-yellow-300" />
        ) : null}
        <div className={`rounded-full border-4 ${ringColor}`}>
          <Avatar selfie={score?.selfie ?? null} alt={score?.teamName ?? ""} />
        </div>
      </div>
      <div
        className={`flex w-full flex-col items-center justify-center rounded-t-md bg-destructive/80 px-2 ${height}`}
      >
        <span className="max-w-full truncate text-sm font-bold">
          {score?.teamName ?? "-"}
        </span>
        <span className="text-lg font-bold text-yellow-200">
          {score?.total ?? 0}
        </span>
      </div>
    </div>
  );
}

function Avatar({ selfie, alt }: { selfie?: string | null; alt: string }) {
  if (selfie) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="size-10 shrink-0 rounded-full bg-cover bg-center"
        style={{ backgroundImage: `url(${JSON.stringify(selfie)})` }}
      />
    );
  }

  return (
    <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-background">
      <div className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
      <div className="absolute bottom-1 left-1/2 size-7 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
    </div>
  );
}
