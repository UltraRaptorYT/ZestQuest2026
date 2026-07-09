"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import supabase from "@/lib/supabase";
import {
  GROUP_SELFIES_BUCKET,
  SELECTED_TEAM_STORAGE_KEY,
  TEAM_TABLE,
  type Team,
} from "@/lib/zestquest";

export default function AddGroupSelfie() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [uploading, setUploading] = useState(false);

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

    loadTeams();

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.team_name === teamName),
    [teamName, teams],
  );

  const previewUrl = useMemo(() => {
    if (!file) {
      return "";
    }

    return URL.createObjectURL(file);
  }, [file]);
  const currentSelfie = previewUrl || selectedTeam?.selfie || "";

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleTeamChange(value: string) {
    setTeamName(value);
    window.localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, value);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (nextFile && !nextFile.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      event.target.value = "";
      return;
    }

    setFile(nextFile);
    event.target.value = "";
  }

  async function uploadSelfie() {
    if (!selectedTeam) {
      toast.error("Select a group first.");
      return;
    }

    if (!file) {
      toast.error("Choose a selfie first.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeTeamName = selectedTeam.team_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const path = `${safeTeamName || selectedTeam.id}-${Date.now()}.${extension}`;

    setUploading(true);
    const uploadResult = await supabase.storage
      .from(GROUP_SELFIES_BUCKET)
      .upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
      });

    if (uploadResult.error) {
      setUploading(false);
      toast.error("Selfie was not uploaded", {
        description: uploadResult.error.message,
      });
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(GROUP_SELFIES_BUCKET)
      .getPublicUrl(path);

    const updateResult = await supabase
      .from(TEAM_TABLE)
      .update({ selfie: publicUrlData.publicUrl })
      .eq("id", selectedTeam.id)
      .select("id, team_name, selfie, created_at")
      .single();

    setUploading(false);

    if (updateResult.error) {
      toast.error("Selfie URL was not saved", {
        description: updateResult.error.message,
      });
      return;
    }

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === updateResult.data.id ? updateResult.data : team,
      ),
    );
    setFile(null);
    toast.success("Group selfie saved", {
      description: selectedTeam.team_name,
    });
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div
        role={currentSelfie ? "img" : undefined}
        aria-label={selectedTeam?.team_name}
        className="flex aspect-square items-center justify-center w-[250px] mx-auto border border-border bg-secondary bg-cover bg-center rounded-full"
        style={
          currentSelfie
            ? { backgroundImage: `url(${JSON.stringify(currentSelfie)})` }
            : undefined
        }
      >
        {!currentSelfie ? (
          <Camera className="size-12 text-muted-foreground" />
        ) : null}
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImagePlus />
          Choose photo
        </Button>
      </div>

      <Button
        type="button"
        onClick={uploadSelfie}
        disabled={uploading || loadingTeams || teams.length === 0}
      >
        <Upload />
        {uploading ? "Uploading..." : "Save selfie"}
      </Button>
    </div>
  );
}
