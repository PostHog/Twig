import { TaskFilterOption } from "@features/task-list/components/TaskFilterOption";
import type { FilterCategoryConfig } from "@features/task-list/utils/filterCategories";
import type { FilterCategory } from "@features/tasks/stores/taskStore";
import { DropdownMenu, Text } from "@radix-ui/themes";

interface TaskFilterCategoryProps {
  config: FilterCategoryConfig;
  onToggleFilter: (category: FilterCategory, value: string) => void;
  defaultOpen?: boolean;
}

export function TaskFilterCategory({
  config,
  onToggleFilter,
  defaultOpen = false,
}: TaskFilterCategoryProps) {
  return (
    <DropdownMenu.Sub defaultOpen={defaultOpen}>
      <DropdownMenu.SubTrigger>
        <Text size="1">{config.label}</Text>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>
        {config.options.map((option) => (
          <TaskFilterOption
            key={option.value}
            category={config.category}
            label={option.label}
            value={option.value}
            onToggle={onToggleFilter}
          />
        ))}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
  );
}
