import { Eye, EyeSlash } from "@phosphor-icons/react";

interface FocusToggleButtonProps {
  isFocused: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}

export function FocusToggleButton({
  isFocused,
  onToggle,
  size = "sm",
}: FocusToggleButtonProps) {
  const iconSize = size === "sm" ? 12 : 14;
  const buttonSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <button
      type="button"
      className={`flex ${buttonSize} items-center justify-center rounded transition-colors ${
        isFocused
          ? "text-accent-11 hover:bg-gray-4 hover:text-gray-12"
          : "text-gray-10 hover:bg-accent-4 hover:text-accent-11"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={isFocused ? "Hide from working copy" : "Show in working copy"}
    >
      {isFocused ? (
        <Eye size={iconSize} weight="fill" />
      ) : (
        <EyeSlash size={iconSize} />
      )}
    </button>
  );
}
