import { Flex, Text, TextField } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { trpcVanilla } from "@renderer/trpc";
import { useCallback, useEffect, useRef, useState } from "react";

const STARTS_WITH_LETTER = /^[a-zA-Z]/;
const VALID_CHARACTERS = /^[a-zA-Z0-9-]*$/;
const MAX_LENGTH = 50;

interface WorkspaceNameInputProps {
  value: string;
  onChange: (name: string) => void;
  onValidChange: (isValid: boolean) => void;
  directoryPath: string;
  size?: Responsive<"1" | "2">;
  placeholder?: string;
}

type ValidationState = {
  isValid: boolean;
  error?: string;
  isChecking: boolean;
};

function validateNameFormat(name: string): { valid: boolean; error?: string } {
  if (!name) return { valid: false, error: "Workspace name is required" };
  if (name.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Name must be ${MAX_LENGTH} characters or less`,
    };
  }
  if (!STARTS_WITH_LETTER.test(name)) {
    return { valid: false, error: "Name must begin with a letter" };
  }
  if (!VALID_CHARACTERS.test(name)) {
    return {
      valid: false,
      error: "Name can only contain letters, numbers, and dashes",
    };
  }
  return { valid: true };
}

export function WorkspaceNameInput({
  value,
  onChange,
  onValidChange,
  directoryPath,
  size = "1",
  placeholder = "my-workspace",
}: WorkspaceNameInputProps) {
  const [validation, setValidation] = useState<ValidationState>({
    isValid: false,
    isChecking: false,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef<string>("");

  useEffect(() => {
    onValidChange(validation.isValid && !validation.isChecking);
  }, [validation.isValid, validation.isChecking, onValidChange]);

  const checkUniqueness = useCallback(
    async (name: string) => {
      if (!directoryPath || !name) return;
      const formatValidation = validateNameFormat(name);
      if (!formatValidation.valid) {
        setValidation({
          isValid: false,
          error: formatValidation.error,
          isChecking: false,
        });
        return;
      }
      if (lastCheckedRef.current === name) {
        return;
      }
      setValidation((prev) => ({ ...prev, isChecking: true }));
      try {
        const result = await trpcVanilla.workspace.checkNameAvailable.query({
          name,
          mainRepoPath: directoryPath,
        });
        if (lastCheckedRef.current !== name) {
          lastCheckedRef.current = name;
          setValidation({
            isValid: result.available,
            error: result.available ? undefined : result.reason,
            isChecking: false,
          });
        }
      } catch (_error) {
        setValidation({
          isValid: false,
          error: "Failed to validate name",
          isChecking: false,
        });
      }
    },
    [directoryPath],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      const formatValidation = validateNameFormat(newValue);
      if (!formatValidation.valid) {
        setValidation({
          isValid: false,
          error: formatValidation.error,
          isChecking: false,
        });
        return;
      }
      setValidation((prev) => ({
        ...prev,
        isChecking: true,
        error: undefined,
      }));
      debounceRef.current = setTimeout(() => {
        checkUniqueness(newValue);
      }, 200);
    },
    [onChange, checkUniqueness],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // recheck when directory changes
  useEffect(() => {
    if (value && directoryPath) {
      lastCheckedRef.current = "";
      checkUniqueness(value);
    }
  }, [directoryPath, value, checkUniqueness]);

  const showError = !validation.isChecking && validation.error && value;

  return (
    <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 120 }}>
      <TextField.Root
        size={size}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        color={showError ? "red" : undefined}
      />
      {showError && (
        <Text size="1" color="red">
          {validation.error}
        </Text>
      )}
    </Flex>
  );
}
