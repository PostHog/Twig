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
      className={`mr-auto max-w-[95%] py-1 xl:max-w-[60%] [&>*:last-child]:mb-0 ${isUser ? "mt-4 rounded-xl rounded-bl-sm bg-gray-2 px-3 py-2" : ""}
      `}
    >
      {children}
    </Box>
  );
}
