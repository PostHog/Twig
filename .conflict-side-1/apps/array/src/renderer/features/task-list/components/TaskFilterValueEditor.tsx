import { TaskFilterOption } from "@features/task-list/components/TaskFilterOption";
import type { FilterCategoryConfig } from "@features/task-list/utils/filterCategories";
import type { FilterCategory } from "@features/tasks/stores/taskStore";

interface TaskFilterValueEditorProps {
  config: FilterCategoryConfig;
  onToggleFilter: (category: FilterCategory, value: string) => void;
}

export function TaskFilterValueEditor({
  config,
  onToggleFilter,
}: TaskFilterValueEditorProps) {
  return (
    <>
      {config.options.map((option) => (
        <TaskFilterOption
          key={option.value}
          category={config.category}
          label={option.label}
          value={option.value}
          onToggle={onToggleFilter}
        />
      ))}
    </>
  );
}
