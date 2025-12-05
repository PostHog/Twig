import { Box } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface ChatBubbleProps {
  variant: "user" | "agent";
  children: ReactNode;
}

export function ChatBubble({ variant, children }: ChatBubbleProps) {
  const isUser = variant === "user";

  return (
    <Box
      className={`max-w-[95%] xl:max-w-[60%] [&>*:last-child]:mb-0 ${
        isUser
          ? "ml-auto rounded-xl rounded-br-sm bg-accent-4 px-3 py-2"
          : "mr-auto"
      }`}
    >
      {children}
    </Box>
  );
}
