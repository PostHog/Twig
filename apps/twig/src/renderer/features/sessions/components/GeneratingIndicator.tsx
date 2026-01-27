import { Campfire, Circle } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

const ACTIVITIES = ["Foraging", "Hunting", "Building", "Gathering", "Crafting"];

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${secs}.${centiseconds.toString().padStart(2, "0")}s`;
}

interface GeneratingIndicatorProps {
  startedAt?: number | null;
}

export function GeneratingIndicator({ startedAt }: GeneratingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [activityIndex, setActivityIndex] = useState(0);

  useEffect(() => {
    const startTime = startedAt ?? Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 50);

    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivityIndex((i) => (i + 1) % ACTIVITIES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Flex
      align="center"
      gap="2"
      className="select-none text-accent-11"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <Campfire size={14} weight="fill" className="campfire-pulse" />
      <Text size="1">{ACTIVITIES[activityIndex]}...</Text>
      <Text size="1" color="gray">
        (Esc to interrupt
      </Text>
      <Circle size={4} weight="fill" className="text-gray-9" style={{ margin: "0 2px" }} />
      <Text
        size="1"
        color="gray"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatDuration(elapsed)})
      </Text>
    </Flex>
  );
}
