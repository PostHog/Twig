import { Box, Text } from "@radix-ui/themes";

interface ThoughtViewProps {
  content: string;
}

export function ThoughtView({ content }: ThoughtViewProps) {
  return (
    <Box
      className="border-l-2 py-1 pl-3"
      style={{ borderColor: "var(--accent-6)" }}
    >
      <Text size="1" className="text-gray-11">
        <Text style={{ color: "var(--accent-11)" }} className="italic">
          Thinking:
        </Text>{" "}
        {content}
      </Text>
    </Box>
  );
}
