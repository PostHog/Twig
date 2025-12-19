import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { File } from "@phosphor-icons/react";
import { Box, Code } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface UserMessageProps {
  content: string;
}

function parseFileMentions(content: string): ReactNode[] {
  const fileTagRegex = /<file\s+path="([^"]+)"\s*\/>/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(fileTagRegex)) {
    if (match.index !== undefined && match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <MarkdownRenderer key={`text-${lastIndex}`} content={textBefore} />,
      );
    }

    const filePath = match[1];
    const fileName = filePath.split("/").pop() ?? filePath;
    parts.push(
      <Code
        key={`file-${match.index}`}
        size="1"
        variant="soft"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          verticalAlign: "middle",
        }}
      >
        <File size={12} />
        {fileName}
      </Code>,
    );

    lastIndex = (match.index ?? 0) + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <MarkdownRenderer
        key={`text-${lastIndex}`}
        content={content.slice(lastIndex)}
      />,
    );
  }

  return parts;
}

export function UserMessage({ content }: UserMessageProps) {
  const hasFileMentions = /<file\s+path="[^"]+"\s*\/>/.test(content);

  return (
    <Box
      className="border-l-2 bg-gray-2 py-2 pl-3"
      style={{ borderColor: "var(--accent-9)" }}
    >
      <Box className="font-medium [&>*:last-child]:mb-0">
        {hasFileMentions ? (
          parseFileMentions(content)
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </Box>
    </Box>
  );
}
