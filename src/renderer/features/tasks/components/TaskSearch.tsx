import { Cross2Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { IconButton, Kbd, TextField } from "@radix-ui/themes";
import { useEffect, useRef } from "react";

interface TaskSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function TaskSearch({ value, onChange }: TaskSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }
        e.preventDefault();
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="transition-all duration-200"
      style={{
        width: "250px",
      }}
    >
        <TextField.Root
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search tasks..."
          size="1"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="12" width="12" />
          </TextField.Slot>
          {value ? (
            <TextField.Slot>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                onClick={handleClear}
                type="button"
              >
                <Cross2Icon width="12" height="12" />
              </IconButton>
            </TextField.Slot>
          ) : (
            <TextField.Slot>
              <Kbd>⌘F</Kbd>
            </TextField.Slot>
          )}
        </TextField.Root>
    </div>
  );
}
