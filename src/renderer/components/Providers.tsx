import { ThemeWrapper } from "@components/ThemeWrapper";
import { queryClient } from "@renderer/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import type React from "react";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeWrapper>{children}</ThemeWrapper>
    </QueryClientProvider>
  );
};
