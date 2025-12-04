import { Bug, Info, Warning, XCircle } from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";

interface ConsoleMessageProps {
  level: "info" | "debug" | "warn" | "error";
  message: string;
  timestamp?: string;
}

export function ConsoleMessage({ level, message }: ConsoleMessageProps) {
  const getIcon = () => {
    switch (level) {
      case "error":
        return <XCircle size={12} weight="fill" />;
      case "warn":
        return <Warning size={12} weight="fill" />;
      case "debug":
        return <Bug size={12} weight="fill" />;
      default:
        return <Info size={12} weight="fill" />;
    }
  };

  const getBadgeColor = (): "gray" | "yellow" | "red" | "purple" => {
    switch (level) {
      case "error":
        return "red";
      case "warn":
        return "yellow";
      case "debug":
        return "purple";
      default:
        return "gray";
    }
  };

  const getLabel = () => {
    switch (level) {
      case "error":
        return "error";
      case "warn":
        return "warn";
      case "debug":
        return "debug";
      default:
        return "info";
    }
  };

  return (
    <Flex align="center" gap="3" className="py-1">
      <Badge color={getBadgeColor()} variant="soft" size="1">
        <Flex align="center" gap="1">
          {getIcon()}
          <Text size="1">{getLabel()}</Text>
        </Flex>
      </Badge>
      <Text size="2" className="text-gray-12">
        {message}
      </Text>
    </Flex>
  );
}
