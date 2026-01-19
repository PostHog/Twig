import { motion } from "framer-motion";

interface LoginTransitionProps {
  isAnimating: boolean;
  onComplete: () => void;
}

export function LoginTransition({
  isAnimating,
  onComplete,
}: LoginTransitionProps) {
  if (!isAnimating) return null;

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--cave-charcoal)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onAnimationComplete={onComplete}
    />
  );
}
