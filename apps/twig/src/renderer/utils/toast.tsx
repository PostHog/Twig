import { CheckIcon, InfoIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { Card, Flex, Spinner, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

interface ToastProps {
  id: string | number;
  type: "loading" | "success" | "error" | "info" | "warning";
  title: ReactNode;
  description?: string;
}

function ToastComponent(props: ToastProps) {
  const { type, title, description } = props;

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
    <Card size="2">
      <Flex gap="3" align="start">
        <Flex
          style={{
            paddingTop: "2px",
            flexShrink: 0,
          }}
        >
          {getIcon()}
        </Flex>
        <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
          <Text size="1" weight="medium">
            {title}
          </Text>
          {description && (
            <Text size="1" color="gray" style={{ wordBreak: "break-word" }}>
              {description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

export const toast = {
  loading: (title: ReactNode, description?: string) => {
    return sonnerToast.custom((id) => (
      <ToastComponent
        id={id}
        type="loading"
        title={title}
        description={description}
      />
    ));
  },

  success: (
    title: ReactNode,
    options?: { description?: string; id?: string | number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="success"
          title={title}
          description={options?.description}
        />
      ),
      { id: options?.id },
    );
  },

  error: (
    title: ReactNode,
    options?: { description?: string; id?: string | number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="error"
          title={title}
          description={options?.description}
        />
      ),
      { id: options?.id },
    );
  },

  info: (title: ReactNode, description?: string) => {
    return sonnerToast.custom((id) => (
      <ToastComponent
        id={id}
        type="info"
        title={title}
        description={description}
      />
    ));
  },

  warning: (
    title: ReactNode,
    options?: { description?: string; id?: string | number; duration?: number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="warning"
          title={title}
          description={options?.description}
        />
      ),
      { id: options?.id, duration: options?.duration },
    );
  },
};
