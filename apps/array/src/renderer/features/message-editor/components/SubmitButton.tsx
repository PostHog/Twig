import { ArrowUp } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";

interface SubmitButtonProps {
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  onClick: () => void;
  size?: number;
}

export function SubmitButton({
  disabled = false,
  loading = false,
  tooltip = "Send message",
  onClick,
  size = 14,
}: SubmitButtonProps) {
  return (
    <Tooltip content={tooltip}>
      <IconButton
        size="1"
        variant="solid"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        disabled={disabled}
        loading={loading}
        style={{
          backgroundColor: disabled ? "var(--accent-a4)" : undefined,
          color: disabled ? "var(--accent-8)" : undefined,
        }}
      >
        <ArrowUp size={size} weight="bold" />
      </IconButton>
    </Tooltip>
  );
}
