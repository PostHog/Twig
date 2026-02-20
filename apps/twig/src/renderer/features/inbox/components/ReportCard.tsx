import { SparkleIcon } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";

interface ReportCardProps {
  report: SignalReport;
  isSelected: boolean;
  onClick: () => void;
}

export function ReportCard({ report, isSelected, onClick }: ReportCardProps) {
  const updatedAtLabel = new Date(report.updated_at).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );

  const isStrongSignal = report.total_weight >= 65 || report.signal_count >= 20;
  const isMediumSignal = report.total_weight >= 30 || report.signal_count >= 6;
  const strengthColor = isStrongSignal
    ? "var(--green-9)"
    : isMediumSignal
      ? "var(--yellow-9)"
      : "var(--gray-8)";
  const strengthLabel = isStrongSignal
    ? "strong"
    : isMediumSignal
      ? "medium"
      : "light";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-gray-5 border-b px-3 py-2 text-left transition-colors hover:bg-gray-2"
      style={{
        backgroundColor: isSelected ? "var(--gray-3)" : "transparent",
      }}
    >
      <Flex align="start" justify="between" gap="3">
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2">
            <span
              title={`Signal strength: ${strengthLabel}`}
              aria-hidden
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                backgroundColor: strengthColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <Text
              size="1"
              weight="medium"
              className="block truncate font-mono text-[12px]"
            >
              {report.title ?? "Untitled signal"}
            </Text>
          </Flex>
          <Text
            size="1"
            color="gray"
            className="block truncate font-mono text-[11px]"
          >
            {report.summary ?? "No summary available yet."}
          </Text>
        </Flex>
        <Flex direction="column" align="end" gap="1" className="shrink-0">
          <Text size="1" color="gray" className="font-mono text-[11px]">
            {updatedAtLabel}
          </Text>
          <Flex align="center" gap="1">
            <SparkleIcon size={11} />
            <Text size="1" color="gray" className="font-mono text-[10px]">
              {report.signal_count}
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </button>
  );
}
