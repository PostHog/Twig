import {
  CheckIcon,
  Copy,
  InfoIcon,
  WarningIcon,
  X,
  XIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  IconButton,
  Inset,
  Spinner,
  Text,
  Tooltip,
} from "@radix-ui/themes";

import { useMemo, useState } from "react";
import { toast as sonnerToast } from "sonner";

function formatErrorDescription(description: string): {
  summary: string;
  details: string;
  isStructured: boolean;
} {
  if (!description) {
    return { summary: "", details: "", isStructured: false };
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return { summary: "", details: "", isStructured: false };
  }

  const tryParse = (input: string): unknown | null => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };

  const parsedDirect = tryParse(trimmed);
  if (parsedDirect !== null) {
    const pretty = JSON.stringify(parsedDirect, null, 2);
    return { summary: pretty, details: pretty, isStructured: true };
  }

  const unwrapped =
    trimmed.startsWith("(") && trimmed.endsWith(")")
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  const parsedUnwrapped = tryParse(unwrapped);
  if (parsedUnwrapped !== null) {
    const pretty = JSON.stringify(parsedUnwrapped, null, 2);
    return { summary: pretty, details: pretty, isStructured: true };
  }

  const asIs = description.replace(/\r\n/g, "\n");
  return { summary: asIs, details: asIs, isStructured: false };
}

interface ToastProps {
  type: "loading" | "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  dismissable?: boolean;
}

function ToastComponent(props: ToastProps) {
  const { type, title, description, dismissable = false } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const formattedDescription = useMemo(() => {
    if (!description) {
      return null;
    }

    return formatErrorDescription(description);
  }, [description]);

  const getIcon = () => {
    switch (type) {
      case "loading":
        return <Spinner size="1" />;
      case "success":
        return <CheckIcon size={16} weight="bold" color="var(--green-9)" />;
      case "error":
        return <XIcon size={16} weight="bold" color="var(--red-9)" />;
      case "info":
        return <InfoIcon size={16} weight="bold" color="var(--blue-9)" />;
      case "warning":
        return <WarningIcon size={16} weight="bold" color="var(--amber-9)" />;
    }
  };

  return (
    <Card size="1">
      <Flex direction="column" gap="1">
        <Flex gap="3" align="center">
          <Flex
            style={{
              paddingTop: "2px",
              flexShrink: 0,
            }}
          >
            {getIcon()}
          </Flex>
          <Flex style={{ flex: 1, minWidth: 0 }}>
            <Text size="1" weight="medium">
              {title}
            </Text>
          </Flex>
          {dismissable && (
            <button
              type="button"
              onClick={() => {
                sonnerToast.dismiss();
              }}
              style={{
                flexShrink: 0,
                marginTop: "-2px",
                marginRight: "-4px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gray-11)",
              }}
            >
              <X size={14} />
            </button>
          )}
        </Flex>

        {formattedDescription && (
          <Inset
            px={"current"}
            pt="current"
            clip="border-box"
            side="bottom"
            pb="current"
          >
            <Flex direction="column" gap="1">
              {formattedDescription.isStructured ||
              type === "error" ||
              type === "warning" ? (
                <Box
                  style={{
                    background: "var(--gray-4)",
                    border: "1px solid var(--gray-6)",
                    borderRadius: "var(--radius-2)",
                    padding: "6px",
                    overflow: "auto",
                    maxHeight: "120px",
                  }}
                >
                  <Box
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontSize: "var(--font-size-1)",
                      lineHeight: "var(--line-height-1)",
                      color: "var(--gray-11)",
                      fontFamily: "var(--font-family-mono)",
                    }}
                  >
                    {formattedDescription.summary}
                  </Box>
                </Box>
              ) : (
                <Text size="1" color="gray" style={{ wordBreak: "break-word" }}>
                  {formattedDescription.summary}
                </Text>
              )}

              {(type === "error" || type === "warning") && (
                <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <Dialog.Trigger>
                    <Button size="1" variant="soft" color="gray">
                      View details
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Content maxWidth="720px" size="1">
                    <Dialog.Description size="1" color="gray">
                      Full details
                    </Dialog.Description>
                    <Flex justify="between" align="center" gap="2">
                      <Dialog.Title size="1">{title}</Dialog.Title>
                      <Tooltip content="Copy">
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          onClick={async () => {
                            const toCopy = `${title}\n\n${formattedDescription.details}`;
                            await navigator.clipboard.writeText(toCopy);
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy size={14} />
                        </IconButton>
                      </Tooltip>
                    </Flex>
                    <Box
                      mt="1"
                      style={{
                        background: "var(--gray-3)",
                        border: "1px solid var(--gray-6)",
                        borderRadius: "var(--radius-3)",
                        padding: "8px",
                        overflow: "auto",
                        maxHeight: "60vh",
                      }}
                    >
                      <Box
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontSize: "var(--font-size-1)",
                          lineHeight: "var(--line-height-1)",
                          fontFamily: "var(--font-family-mono)",
                        }}
                      >
                        {formattedDescription.details}
                      </Box>
                    </Box>
                  </Dialog.Content>
                </Dialog.Root>
              )}
            </Flex>
          </Inset>
        )}
      </Flex>
    </Card>
  );
}

export const toast = {
  loading: (title: string, description?: string) => {
    return sonnerToast.custom(() => (
      <ToastComponent type="loading" title={title} description={description} />
    ));
  },

  success: (
    title: string,
    options?: { description?: string; id?: string | number },
  ) => {
    return sonnerToast.custom(
      () => (
        <ToastComponent
          type="success"
          title={title}
          description={options?.description}
          dismissable
        />
      ),
      { id: options?.id },
    );
  },

  error: (
    title: string,
    options?: { description?: string; id?: string | number },
  ) => {
    return sonnerToast.custom(
      () => (
        <ToastComponent
          type="error"
          title={title}
          description={options?.description}
          dismissable
        />
      ),
      { id: options?.id, duration: Number.POSITIVE_INFINITY },
    );
  },

  info: (title: string, description?: string) => {
    return sonnerToast.custom(() => (
      <ToastComponent
        type="info"
        title={title}
        description={description}
        dismissable
      />
    ));
  },

  warning: (
    title: string,
    options?: { description?: string; id?: string | number; duration?: number },
  ) => {
    return sonnerToast.custom(
      () => (
        <ToastComponent
          type="warning"
          title={title}
          description={options?.description}
          dismissable
        />
      ),
      {
        id: options?.id,
        duration: options?.duration ?? Number.POSITIVE_INFINITY,
      },
    );
  },
};
