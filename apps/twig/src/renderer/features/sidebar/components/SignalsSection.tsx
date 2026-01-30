import { SparkleIcon } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import type { SignalData } from "../hooks/useSidebarData";

interface SignalsSectionProps {
  signals: SignalData[];
  activeSignalId: string | null;
  isAutonomyEnabled: boolean;
  onSignalClick: (signalId: string) => void;
  onViewAllClick: () => void;
  onEnableAutonomy: () => void;
}

function SignalItem({
  signal,
  isActive,
  onClick,
}: {
  signal: SignalData;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group mx-2 flex w-[calc(100%-16px)] cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
        isActive
          ? "bg-accent-4 text-accent-11"
          : "text-gray-11 hover:bg-gray-3 hover:text-gray-12"
      }`}
    >
      <SparkleIcon
        size={14}
        className={`mt-0.5 flex-shrink-0 ${isActive ? "text-accent-9" : "text-gray-9"}`}
      />
      <Text
        size="1"
        className={`line-clamp-2 ${isActive ? "text-accent-11" : "text-gray-11 group-hover:text-gray-12"}`}
      >
        {signal.title}
      </Text>
    </button>
  );
}

function EnableAutonomyCTA({ onEnable }: { onEnable: () => void }) {
  return (
    <button
      type="button"
      onClick={onEnable}
      className="group mx-2 flex w-[calc(100%-16px)] cursor-pointer items-start gap-2 rounded-md bg-accent-3 px-2 py-2 text-left transition-colors hover:bg-accent-4"
    >
      <SparkleIcon size={14} className="mt-0.5 flex-shrink-0 text-accent-9" />
      <Text size="1" className="text-accent-11">
        Enable Autonomy to receive AI-detected issues from your sessions
      </Text>
    </button>
  );
}

export function SignalsSection({
  signals,
  activeSignalId,
  isAutonomyEnabled,
  onSignalClick,
  onViewAllClick,
  onEnableAutonomy,
}: SignalsSectionProps) {
  const displayedSignals = signals.slice(0, 3);
  const hasMore = signals.length > 3;

  return (
    <Flex direction="column" py="1">
      <div className="px-2 py-1 font-medium font-mono text-[10px] text-gray-10 uppercase tracking-wide">
        Signals
      </div>
      {!isAutonomyEnabled ? (
        <EnableAutonomyCTA onEnable={onEnableAutonomy} />
      ) : signals.length === 0 ? (
        <div className="mx-2 px-2 py-1.5 text-gray-10 text-xs">
          No signals yet
        </div>
      ) : (
        <>
          {displayedSignals.map((signal) => (
            <SignalItem
              key={signal.id}
              signal={signal}
              isActive={activeSignalId === signal.id}
              onClick={() => onSignalClick(signal.id)}
            />
          ))}
          {hasMore && (
            <div className="px-2 pt-1">
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={onViewAllClick}
                style={{ width: "100%" }}
              >
                View all {signals.length}
              </Button>
            </div>
          )}
        </>
      )}
    </Flex>
  );
}
