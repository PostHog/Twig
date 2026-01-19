import { DotPattern } from "@components/ui/DotPattern";
import { NotePencil } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { useId, useState } from "react";

interface CreateTaskLaneProps {
  onClick: () => void;
}

export function CreateTaskLane({ onClick }: CreateTaskLaneProps) {
  const patternId = useId();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      style={{
        width: "288px",
        minWidth: "288px",
        height: "100%",
        borderRight: "1px solid var(--gray-5)",
        position: "relative",
      }}
    >
      <DotPattern
        id={`create-lane-${patternId}`}
        opacity={0.5}
        color="var(--gray-5)"
      />

      <Flex
        direction="column"
        align="center"
        gap="3"
        style={{
          position: "relative",
          zIndex: 1,
          color: "var(--gray-7)",
        }}
      >
        <NotePencil size={48} weight="light" />
        <Text
          size="2"
          onClick={onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            color: isHovered ? "var(--gray-11)" : "inherit",
            cursor: "pointer",
            transition: "color 150ms ease",
          }}
        >
          Create new task
        </Text>
      </Flex>
    </Flex>
  );
}
