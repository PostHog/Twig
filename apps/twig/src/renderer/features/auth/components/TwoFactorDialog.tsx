import {
  Button,
  Callout,
  Dialog,
  Flex,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";

interface TwoFactorDialogProps {
  methods: string[];
  onSubmit: (code: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
}

export function TwoFactorDialog({
  methods,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
}: TwoFactorDialogProps) {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code.trim());
    }
  };

  const hasTotp = methods.includes("totp");
  const hasBackupCodes = methods.includes("backup_codes");
  const hasPasskey = methods.includes("passkey");

  return (
    <Dialog.Root open={true}>
      <Dialog.Content
        style={{
          maxWidth: 400,
          backgroundColor: "var(--cave-cream)",
        }}
      >
        <Dialog.Title>
          <Text
            size="5"
            weight="medium"
            style={{ color: "var(--cave-charcoal)" }}
          >
            Two-Factor Authentication
          </Text>
        </Dialog.Title>
        <Dialog.Description size="2" mb="4" style={{ color: "var(--gray-11)" }}>
          {hasTotp && (
            <>
              Enter the 6-digit code from your authenticator app.
              {hasBackupCodes && " Or use a backup code."}
            </>
          )}
          {!hasTotp && hasBackupCodes && "Enter a backup code to continue."}
          {hasPasskey &&
            !hasTotp &&
            !hasBackupCodes &&
            "Use your passkey to continue."}
        </Dialog.Description>

        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="4">
            <Flex direction="column" gap="1">
              <Text
                as="label"
                size="2"
                weight="medium"
                style={{ color: "var(--cave-charcoal)", opacity: 0.8 }}
              >
                {hasTotp ? "Authentication Code" : "Backup Code"}
              </Text>
              <TextField.Root
                size="3"
                type="text"
                placeholder={hasTotp ? "123456" : "XXXX-XXXX"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </Flex>

            {error && (
              <Callout.Root color="red" size="1">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex gap="3" justify="end">
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !code.trim()}
                style={{
                  backgroundColor: "var(--cave-charcoal)",
                  color: "var(--cave-cream)",
                }}
              >
                {isLoading && <Spinner />}
                Verify
              </Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
