import { useCallback, useEffect, useRef, useState } from "react";

const ROTATION_INTERVAL_MS = 4000;

export function useFeatureRotation(featureCount: number) {
  const [activeIndex, setActiveIndex] = useState(0);
  const isPaused = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      if (!isPaused.current) {
        setActiveIndex((prev) => (prev + 1) % featureCount);
      }
    }, ROTATION_INTERVAL_MS);
  }, [featureCount]);

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startInterval]);

  const onHover = useCallback((index: number) => {
    isPaused.current = true;
    setActiveIndex(index);
    // Reset interval so it starts fresh when unpaused
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  const onLeave = useCallback(() => {
    isPaused.current = false;
    startInterval();
  }, [startInterval]);

  return { activeIndex, setActiveIndex, onHover, onLeave };
}
