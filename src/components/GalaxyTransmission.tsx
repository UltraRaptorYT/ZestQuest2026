"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Radio } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import supabase from "@/lib/supabase";
import {
  GALAXY_TRANSMISSION_STATE_TABLE,
  SCORE_LOG_TABLE,
  TEAM_TABLE,
  type Team,
} from "@/lib/zestquest";
import {
  getSelectedTeam,
  saveSelectedTeam,
  subscribeToSelectedTeam,
} from "@/lib/selectedTeam";

const CUT_COUNT = 15;
const GRID_COUNT = 7;

type GalaxyTransmissionState = {
  id: number;
  round: number;
  grid_order: number[];
  grid_orders: number[][];
  updated_at: string;
};

function shuffledGrid(currentGrid?: number[]) {
  const grid = Array.from({ length: CUT_COUNT }, (_, index) => index + 1);

  for (let index = grid.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [grid[index], grid[swapIndex]] = [grid[swapIndex], grid[index]];
  }

  // Keep the next round visibly different from the current one.
  if (currentGrid?.every((cut, index) => cut === grid[index])) {
    [grid[0], grid[1]] = [grid[1], grid[0]];
  }

  return grid;
}

function isValidGrid(grid: number[]) {
  return (
    grid.length === CUT_COUNT &&
    new Set(grid).size === CUT_COUNT &&
    grid.every((cut) => Number.isInteger(cut) && cut >= 1 && cut <= CUT_COUNT)
  );
}

function isValidGridSet(grids: number[][]) {
  return grids.length === GRID_COUNT && grids.every(isValidGrid);
}

function createGridSet(currentGrid?: number[], currentIndex = 0) {
  const grids: number[][] = Array.from({ length: GRID_COUNT }, () => []);
  const seen = new Set<string>();

  if (currentGrid && isValidGrid(currentGrid)) {
    grids[currentIndex] = currentGrid;
    seen.add(currentGrid.join(","));
  }

  for (let index = 0; index < GRID_COUNT; index += 1) {
    if (grids[index].length > 0) continue;

    let grid = shuffledGrid();
    while (seen.has(grid.join(","))) {
      grid = shuffledGrid();
    }
    grids[index] = grid;
    seen.add(grid.join(","));
  }

  return grids;
}

export default function GalaxyTransmission({
  admin = false,
}: {
  admin?: boolean;
}) {
  const [gridState, setGridState] = useState<GalaxyTransmissionState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [awardingPoints, setAwardingPoints] = useState(false);
  const gridHeightOffset = admin ? 370 : 240;

  useEffect(() => {
    if (!admin) return;
    const unsubscribeFromTeam = subscribeToSelectedTeam(setSelectedTeam);

    async function loadTeams() {
      setLoadingTeams(true);
      const { data, error: teamsError } = await supabase
        .from(TEAM_TABLE)
        .select("id, team_name, selfie, created_at")
        .order("id", { ascending: true });

      if (teamsError) {
        toast.error("Could not load groups", {
          description: teamsError.message,
        });
      } else if (data) {
        setTeams(data);
        const savedTeam = getSelectedTeam();
        const selectedTeamName = data.some(
          (team) => team.team_name === savedTeam,
        )
          ? savedTeam
          : (data[0]?.team_name ?? "");
        setSelectedTeam(selectedTeamName);
        if (selectedTeamName && selectedTeamName !== savedTeam) {
          saveSelectedTeam(selectedTeamName);
        }
      }
      setLoadingTeams(false);
    }

    loadTeams();

    return unsubscribeFromTeam;
  }, [admin]);

  useEffect(() => {
    let active = true;

    async function loadGrid() {
      const { data, error: readError } = await supabase
        .from(GALAXY_TRANSMISSION_STATE_TABLE)
        .select("id, round, grid_order, grid_orders, updated_at")
        .eq("id", 1)
        .maybeSingle();

      if (!active) return;

      if (readError) {
        setError(readError.message);
        setLoading(false);
        return;
      }

      if (data) {
        const savedState = data as GalaxyTransmissionState;
        if (!isValidGrid(savedState.grid_order)) {
          setError(
            "The saved layout is invalid. Ask the admin to choose a grid.",
          );
          setLoading(false);
          return;
        }

        const selectedGrid = Math.min(Math.max(savedState.round, 1), GRID_COUNT);
        const gridOrders = isValidGridSet(savedState.grid_orders)
          ? savedState.grid_orders
          : createGridSet(savedState.grid_order, selectedGrid - 1);
        const state: GalaxyTransmissionState = {
          ...savedState,
          round: selectedGrid,
          grid_order: gridOrders[selectedGrid - 1],
          grid_orders: gridOrders,
        };

        if (gridOrders !== savedState.grid_orders || state.round !== savedState.round) {
          const { error: updateError } = await supabase
            .from(GALAXY_TRANSMISSION_STATE_TABLE)
            .update({
              round: state.round,
              grid_order: state.grid_order,
              grid_orders: state.grid_orders,
              updated_at: new Date().toISOString(),
            })
            .eq("id", 1);

          if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
          }
        }

        setGridState(state);
        setLoading(false);
        return;
      }

      // The first visitor creates the shared, randomized opening layout.
      const gridOrders = createGridSet();
      const initialState = {
        id: 1,
        round: 1,
        grid_order: gridOrders[0],
        grid_orders: gridOrders,
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error: insertError } = await supabase
        .from(GALAXY_TRANSMISSION_STATE_TABLE)
        .insert(initialState)
        .select("id, round, grid_order, grid_orders, updated_at")
        .single();

      if (!active) return;

      if (insertError) {
        // Another device may have initialized the row at the same time.
        const { data: existing, error: retryError } = await supabase
          .from(GALAXY_TRANSMISSION_STATE_TABLE)
          .select("id, round, grid_order, grid_orders, updated_at")
          .eq("id", 1)
          .maybeSingle();

        if (retryError || !existing) {
          setError(retryError?.message ?? insertError.message);
        } else {
          setGridState(existing as GalaxyTransmissionState);
        }
      } else {
        setGridState(inserted as GalaxyTransmissionState);
      }

      setLoading(false);
    }

    loadGrid();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("zestquest-26-galaxy-transmission")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: GALAXY_TRANSMISSION_STATE_TABLE,
          filter: "id=eq.1",
        },
        (payload) => {
          if (payload.new && "grid_order" in payload.new) {
            const nextState = payload.new as GalaxyTransmissionState;
            if (isValidGrid(nextState.grid_order)) {
              setGridState(nextState);
              setError("");
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function selectGrid(index: number) {
    if (!admin || !gridState || saving || index < 0 || index >= GRID_COUNT) {
      return;
    }

    const selectedGrid = index + 1;
    if (selectedGrid === gridState.round) return;

    setSaving(true);
    const { data, error: updateError } = await supabase
      .from(GALAXY_TRANSMISSION_STATE_TABLE)
      .update({
        round: selectedGrid,
        grid_order: gridState.grid_orders[index],
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("id, round, grid_order, grid_orders, updated_at")
      .single();
    setSaving(false);

    if (updateError) {
      toast.error("Could not change the grid", {
        description: updateError.message,
      });
      return;
    }

    setGridState(data as GalaxyTransmissionState);
    toast.success(`Grid ${selectedGrid} is live`);
  }

  async function awardPoints() {
    if (!admin || !selectedTeam || awardingPoints) return;

    setAwardingPoints(true);
    const { error: scoreError } = await supabase.from(SCORE_LOG_TABLE).insert({
      team_name: selectedTeam,
      score: 10,
      added_by: "Admin",
      is_admin: true,
      remarks: `Galaxy Transmission grid ${gridState?.round ?? ""} completed correctly`,
    });
    setAwardingPoints(false);

    if (scoreError) {
      toast.error("Could not award points", {
        description: scoreError.message,
      });
      return;
    }

    toast.success("+10 points awarded", {
      description: `${selectedTeam} completed Galaxy Transmission correctly.`,
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-3 py-1 sm:gap-4">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-emerald-400">
            <Radio aria-hidden="true" className="size-3.5" />
            <span>LIVE TRANSMISSION</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {gridState ? (
              <span className="rounded-full border px-2.5 py-1 text-sm text-muted-foreground">
                Grid {gridState.round}
              </span>
            ) : null}
            {admin && saving ? (
              <LoaderCircle
                aria-label="Changing grid"
                className="size-4 animate-spin text-muted-foreground"
              />
            ) : null}
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Galaxy Transmission
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Arrange all 15 launch cuts to match this 3 × 5 grid.
          </p>
        </div>
      </header>

      {admin && gridState ? (
        <nav
          aria-label="Select Galaxy Transmission grid"
          className="mx-auto flex max-w-full items-center justify-center gap-1 overflow-x-auto"
        >
          <Button
            aria-label="Previous grid"
            className="size-11 shrink-0"
            variant="outline"
            onClick={() => selectGrid(gridState.round - 2)}
            disabled={saving || gridState.round === 1}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          {Array.from({ length: GRID_COUNT }, (_, index) => {
            const number = index + 1;
            const active = gridState.round === number;

            return (
              <Button
                key={number}
                aria-current={active ? "step" : undefined}
                aria-label={`Grid ${number}${active ? ", current grid" : ""}`}
                className="size-10 shrink-0 px-0"
                variant={active ? "default" : "outline"}
                onClick={() => selectGrid(index)}
                disabled={saving}
              >
                {number}
              </Button>
            );
          })}
          <Button
            aria-label="Next grid"
            className="size-11 shrink-0"
            variant="outline"
            onClick={() => selectGrid(gridState.round)}
            disabled={saving || gridState.round === GRID_COUNT}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      ) : null}

      {admin ? (
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Group
            <select
              value={selectedTeam}
              onChange={(event) => {
                setSelectedTeam(event.target.value);
                saveSelectedTeam(event.target.value);
              }}
              disabled={loadingTeams || teams.length === 0 || awardingPoints}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {teams.length === 0 ? (
                <option value="">{loadingTeams ? "Loading groups…" : "No groups found"}</option>
              ) : null}
              {teams.map((team) => (
                <option key={team.id} value={team.team_name}>
                  {team.team_name}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="min-h-11 shrink-0"
            onClick={awardPoints}
            disabled={!selectedTeam || loadingTeams || awardingPoints}
          >
            {awardingPoints ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : null}
            +10 points
          </Button>
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm"
          role="alert"
        >
          <p className="font-medium">Galaxy Transmission is not ready.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            Run <code>supabase/zestquest_26_galaxy_transmission.sql</code> in the
            Supabase SQL editor, then reload this tab.
          </p>
        </div>
      ) : loading ? (
        <div
          className="mx-auto grid aspect-[0.423] w-full grid-cols-3 grid-rows-5 gap-1.5 sm:gap-2"
          style={{
            maxWidth: `min(100%, calc((100dvh - ${gridHeightOffset}px) * 0.423))`,
          }}
          aria-label="Loading grid"
        >
          {Array.from({ length: CUT_COUNT }, (_, index) => (
            <div
              key={index}
              className="min-h-0 min-w-0 animate-pulse rounded-md bg-muted sm:rounded-lg"
            />
          ))}
        </div>
      ) : gridState ? (
        <div
          className="mx-auto grid aspect-[0.423] w-full grid-cols-3 grid-rows-5 gap-1.5 sm:gap-2"
          style={{
            maxWidth: `min(100%, calc((100dvh - ${gridHeightOffset}px) * 0.423))`,
          }}
          aria-label={`Galaxy Transmission grid ${gridState.round}, 3 rows and 5 columns`}
        >
          {gridState.grid_order.map((cut, index) => (
            <div
              key={`${gridState.round}-${index}-${cut}`}
              className="relative min-h-0 min-w-0 overflow-hidden rounded-md border bg-black shadow-sm sm:rounded-lg"
            >
              <Image
                src={`/launch/${cut}.png`}
                alt={`Launch cut ${cut}, position ${index + 1}`}
                fill
                sizes="(max-width: 640px) 20vw, 110px"
                className="object-contain"
                priority={index < 3}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
