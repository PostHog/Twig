import type { CompletionSound } from "@features/settings/stores/settingsStore";
import daniloUrl from "@renderer/assets/sounds/danilo.mp3";
import guitarUrl from "@renderer/assets/sounds/guitar.mp3";
import meepUrl from "@renderer/assets/sounds/meep.mp3";
import reviUrl from "@renderer/assets/sounds/revi.mp3";

const SOUND_URLS: Record<Exclude<CompletionSound, "none">, string> = {
  guitar: guitarUrl,
  danilo: daniloUrl,
  revi: reviUrl,
  meep: meepUrl,
};

let currentAudio: HTMLAudioElement | null = null;

export function playCompletionSound(sound: CompletionSound, volume = 80): void {
  if (sound === "none") return;

  const url = SOUND_URLS[sound];
  if (!url) return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(100, volume)) / 100;
  currentAudio = audio;
  audio.play().catch(() => {
    // Audio play can fail if user hasn't interacted with the page yet
  });
  audio.addEventListener("ended", () => {
    if (currentAudio === audio) {
      currentAudio = null;
    }
  });
}
