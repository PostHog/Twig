import { Campfire } from "@phosphor-icons/react";
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

export function GeneratingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  const [activityIndex, setActivityIndex] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 50);

    return () => clearInterval(interval);
  }, []);

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
      <Text
        size="1"
        color="gray"
        style={{ fontVariantNumeric: "tabular-nums", minWidth: "50px" }}
      >
        {formatDuration(elapsed)}
      </Text>
    </Flex>
  );
}
