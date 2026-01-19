import { ThemeWrapper } from "@components/ThemeWrapper";
import { queryClient } from "@renderer/lib/queryClient";
import { createTrpcClient, trpcReact } from "@renderer/trpc";
import { QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>{children}</ThemeWrapper>
      </QueryClientProvider>
    </trpcReact.Provider>
  );
};
