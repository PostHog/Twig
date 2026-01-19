interface GridPatternProps {
  /** Unique ID for the pattern (needed when multiple patterns on same page) */
  id?: string;
  /** Opacity of the pattern (default: 0.4) */
  opacity?: number;
  /** Line color (default: gray-6) */
  color?: string;
  /** Grid cell size (default: 16) */
  size?: number;
}

export function GridPattern({
  id = "grid-pattern",
  opacity = 0.4,
  color = "var(--gray-5)",
  size = 16,
}: GridPatternProps) {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
      }}
    >
      <defs>
        <pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width={size}
          height={size}
        >
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Keep DotPattern as alias for backwards compatibility
export const DotPattern = GridPattern;
