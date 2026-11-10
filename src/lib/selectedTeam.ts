import { SELECTED_TEAM_STORAGE_KEY } from "@/lib/zestquest";

const SELECTED_TEAM_CHANGE_EVENT = "zestquest:selected-team-change";

export function getSelectedTeam() {
  return window.localStorage.getItem(SELECTED_TEAM_STORAGE_KEY) ?? "";
}

export function saveSelectedTeam(teamName: string) {
  window.localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, teamName);
  window.dispatchEvent(
    new CustomEvent<string>(SELECTED_TEAM_CHANGE_EVENT, { detail: teamName }),
  );
}

export function subscribeToSelectedTeam(
  onChange: (teamName: string) => void,
) {
  function handleStorage(event: StorageEvent) {
    if (event.key === SELECTED_TEAM_STORAGE_KEY) {
      onChange(event.newValue ?? "");
    }
  }

  function handleSamePageChange(event: Event) {
    onChange((event as CustomEvent<string>).detail);
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SELECTED_TEAM_CHANGE_EVENT, handleSamePageChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SELECTED_TEAM_CHANGE_EVENT, handleSamePageChange);
  };
}
