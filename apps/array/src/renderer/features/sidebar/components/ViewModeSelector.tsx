import { ClockCounterClockwise, Folder, PushPin } from "@phosphor-icons/react";
import { Select, Text } from "@radix-ui/themes";
import { type SidebarViewMode, useSidebarStore } from "../stores/sidebarStore";

const VIEW_OPTIONS = [
  { value: "history" as const, label: "History", Icon: ClockCounterClockwise },
  { value: "pinned" as const, label: "Pinned", Icon: PushPin },
  { value: "folders" as const, label: "Repositories", Icon: Folder },
];

export function ViewModeSelector() {
  const viewMode = useSidebarStore((state) => state.viewMode);
  const setViewMode = useSidebarStore((state) => state.setViewMode);
  const resetHistoryVisibleCount = useSidebarStore(
    (state) => state.resetHistoryVisibleCount,
  );

  const handleChange = (value: SidebarViewMode) => {
    if (value === "history") {
      resetHistoryVisibleCount();
    }
    setViewMode(value);
  };

  const currentOption = VIEW_OPTIONS.find((o) => o.value === viewMode);
  const CurrentIcon = currentOption?.Icon ?? Folder;

  return (
    <Select.Root value={viewMode} onValueChange={handleChange} size="1">
      <Select.Trigger
        variant="ghost"
        style={{
          fontSize: "var(--font-size-1)",
          color: "var(--gray-11)",
          padding: "4px 8px",
          height: "auto",
          minHeight: "unset",
          width: "100%",
        }}
      >
        <span className="flex items-center gap-1.5">
          <CurrentIcon size={12} />
          <Text size="1" style={{ fontFamily: "var(--font-mono)" }}>
            {currentOption?.label}
          </Text>
        </span>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {VIEW_OPTIONS.map((option) => {
          const OptionIcon = option.Icon;
          return (
            <Select.Item key={option.value} value={option.value}>
              <span className="flex items-center gap-1.5">
                <OptionIcon size={12} />
                {option.label}
              </span>
            </Select.Item>
          );
        })}
      </Select.Content>
    </Select.Root>
  );
}
