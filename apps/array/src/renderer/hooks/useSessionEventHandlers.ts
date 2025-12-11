import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { sessionEvents } from "@renderer/lib/sessionEvents";
import { sounds } from "@renderer/lib/sounds";
import { useEffect, useRef } from "react";

/**
 * Hook that subscribes to session events and handles side effects.
 * Should be mounted once at the app level.
 */
export function useSessionEventHandlers() {
  const completionSound = useSettingsStore((state) => state.completionSound);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsubscribe = sessionEvents.on(
      "prompt:complete",
      ({ stopReason }) => {
        if (stopReason !== "end_turn") return;
        if (completionSound === "none") return;

        // Stop any currently playing sound
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }

        const soundUrl = sounds[completionSound];
        const audio = new Audio(soundUrl);
        audioRef.current = audio;
        audio.play().catch(() => {
          // Ignore autoplay errors
        });
      },
    );

    return () => {
      unsubscribe();
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [completionSound]);
}
