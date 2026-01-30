import { useAutonomyFeatureFlag } from "@features/autonomy/hooks/useAutonomyFeatureFlag";
import { useSignals } from "@features/signals/hooks/useSignals";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Signal } from "@shared/types";

function SignalCard({
  signal,
  onClick,
}: {
  signal: Signal;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-accent-6 bg-accent-2 p-4 text-left transition-colors hover:border-accent-8 hover:bg-accent-3"
    >
      <SparkleIcon size={20} className="mt-0.5 flex-shrink-0 text-accent-9" />
      <Flex direction="column" gap="2" style={{ flex: 1 }}>
        <Flex align="start" justify="between" gap="2">
          <Text size="3" weight="medium" className="text-accent-12">
            {signal.title || "Untitled signal"}
          </Text>
          <Text
            size="1"
            className="whitespace-nowrap rounded bg-accent-4 px-1.5 py-0.5 text-accent-11"
          >
            AUTO-DETECTED
          </Text>
        </Flex>
        {signal.task_prompt && (
          <Text
            size="2"
            className="line-clamp-3 text-accent-11 leading-relaxed"
          >
            {signal.task_prompt}
          </Text>
        )}
        <Flex align="center" gap="2" mt="1">
          {signal.relevant_user_count != null && (
            <Text size="1" color="gray">
              {signal.relevant_user_count} users affected
            </Text>
          )}
          {signal.occurrence_count != null && (
            <>
              <Text size="1" color="gray">
                -
              </Text>
              <Text size="1" color="gray">
                {signal.occurrence_count} occurrences
              </Text>
            </>
          )}
        </Flex>
      </Flex>
      <ArrowRightIcon
        size={18}
        className="mt-0.5 flex-shrink-0 text-accent-9 group-hover:text-accent-11"
      />
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <Flex direction="column" gap="3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Box key={i} className="rounded-lg border border-gray-6 bg-gray-2 p-4">
          <Flex align="start" gap="3">
            <Skeleton height="20px" width="20px" className="rounded" />
            <Flex direction="column" gap="2" style={{ flex: 1 }}>
              <Skeleton height="20px" width="70%" />
              <Skeleton height="16px" width="100%" />
              <Skeleton height="16px" width="85%" />
              <Skeleton height="14px" width="30%" />
            </Flex>
          </Flex>
        </Box>
      ))}
    </Flex>
  );
}

function EmptyState() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      py="9"
      className="text-center"
    >
      <SparkleIcon size={48} className="text-gray-6" />
      <Heading size="4" color="gray">
        No signals detected yet
      </Heading>
      <Text size="2" color="gray" style={{ maxWidth: 400 }}>
        Autonomy is analyzing your user sessions. Check back soon for
        auto-detected issues and suggested improvements.
      </Text>
    </Flex>
  );
}

export function SignalsView() {
  const isAutonomyEnabled = useAutonomyFeatureFlag();
  const { navigateToTaskInput, navigateToSignalPreview } = useNavigationStore();
  const { data: allSignals = [], isLoading } = useSignals();

  // Filter to only pending signals (those without a linked task)
  const pendingSignals = allSignals.filter((signal) => signal.task === null);

  // Feature flag gating
  if (!isAutonomyEnabled) {
    return null;
  }

  const handleSignalClick = (signal: Signal) => {
    navigateToSignalPreview(signal);
  };

  return (
    <Flex direction="column" height="100%">
      <Box px="4" py="3" className="border-gray-6 border-b bg-gray-1">
        <Flex align="center" gap="3">
          <IconButton
            variant="ghost"
            size="1"
            onClick={() => navigateToTaskInput()}
            title="Back to task input"
          >
            <ArrowLeftIcon size={16} />
          </IconButton>
          <Flex align="center" gap="2">
            <SparkleIcon size={20} className="text-accent-9" />
            <Heading size="4">Signals</Heading>
          </Flex>
        </Flex>
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="4">
          <Text size="2" color="gray" mb="4" className="block">
            Auto-detected issues from user session analysis. Review and start a
            task to address them.
          </Text>

          {isLoading && <LoadingSkeleton />}

          {!isLoading && pendingSignals.length === 0 && <EmptyState />}

          {!isLoading && pendingSignals.length > 0 && (
            <Flex direction="column" gap="3">
              {pendingSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  onClick={() => handleSignalClick(signal)}
                />
              ))}
            </Flex>
          )}
        </Box>
      </ScrollArea>
    </Flex>
  );
}
