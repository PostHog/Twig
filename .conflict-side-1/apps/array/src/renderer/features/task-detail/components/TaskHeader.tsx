import { Code, Flex, Heading } from "@radix-ui/themes";
import type React from "react";
import { type Control, Controller } from "react-hook-form";

interface TaskHeaderProps {
  slug: string;
  control: Control<{ title: string; description: string }>;
  onSubmit: () => void;
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({
  slug,
  control,
  onSubmit,
}) => {
  return (
    <Flex direction="row" gap="2" align="baseline">
      <Code size="3" color="gray" variant="ghost" style={{ flexShrink: 0 }}>
        {slug}
      </Code>
      <Controller
        name="title"
        control={control}
        render={({ field }) => (
          <Heading
            size="5"
            contentEditable
            suppressContentEditableWarning
            ref={(el) => {
              if (el && el.textContent !== field.value) {
                el.textContent = field.value;
              }
            }}
            onBlur={(e) => {
              field.onChange(e.currentTarget.textContent || "");
              onSubmit();
            }}
            style={{
              cursor: "text",
              outline: "none",
              flex: 1,
              minWidth: 0,
            }}
          />
        )}
      />
    </Flex>
  );
};
