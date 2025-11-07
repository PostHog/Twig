import { AsciiArt } from "@components/AsciiArt";
import { Box } from "@radix-ui/themes";
import type React from "react";

interface BackgroundWrapperProps {
  children: React.ReactNode;
}

export const BackgroundWrapper: React.FC<BackgroundWrapperProps> = ({
  children,
}) => {
  return (
    <Box height="100%" position="relative">
      <Box style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <AsciiArt scale={1} opacity={0.1} />
      </Box>
      <Box style={{ position: "relative", zIndex: 1, height: "100%" }}>
        {children}
      </Box>
    </Box>
  );
};
