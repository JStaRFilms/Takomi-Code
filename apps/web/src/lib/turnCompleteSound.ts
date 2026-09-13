import turnCompleteChimeUrl from "../assets/turn-complete-chime.mp3?url";

export function playTurnCompleteSound(): void {
  const audio = new Audio(turnCompleteChimeUrl);
  audio.preload = "auto";
  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}
