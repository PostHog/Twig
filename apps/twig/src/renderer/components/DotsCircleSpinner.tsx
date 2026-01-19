import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL = 80;

interface DotsCircleSpinnerProps {
  size?: number;
  className?: string;
}

export function DotsCircleSpinner({
  size = 12,
  className,
}: DotsCircleSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {FRAMES[frameIndex]}
    </span>
  );
}
