import {
  CheckIcon,
  InfoIcon,
  WarningIcon,
  X,
  XIcon,
} from "@phosphor-icons/react";
import { Card, Flex, IconButton, Spinner, Text } from "@radix-ui/themes";
import { toast as sonnerToast } from "sonner";

interface ToastProps {
  id: string | number;
  type: "loading" | "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  dismissable?: boolean;
}

function ToastComponent(props: ToastProps) {
  const { id, type, title, description, dismissable = false } = props;

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
        {dismissable && (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => sonnerToast.dismiss(id)}
            style={{ flexShrink: 0, marginTop: "-2px", marginRight: "-4px" }}
          >
            <X size={14} />
          </IconButton>
        )}
      </Flex>
    </Card>
  );
}

export const toast = {
  loading: (title: string, description?: string) => {
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
    title: string,
    options?: { description?: string; id?: string | number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
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
      (id) => (
        <ToastComponent
          id={id}
          type="error"
          title={title}
          description={options?.description}
          dismissable
        />
      ),
      { id: options?.id },
    );
  },

  info: (title: string, description?: string) => {
    return sonnerToast.custom((id) => (
      <ToastComponent
        id={id}
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
      (id) => (
        <ToastComponent
          id={id}
          type="warning"
          title={title}
          description={options?.description}
          dismissable
        />
      ),
      { id: options?.id, duration: options?.duration },
    );
  },
};
