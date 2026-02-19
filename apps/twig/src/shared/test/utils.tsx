import { Theme } from "@radix-ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement } from "react";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  const testQueryClient = createTestQueryClient();

  return render(ui, {
    wrapper: ({ children }) => (
      <Theme>
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      </Theme>
    ),
    ...options,
  });
}

export * from "@testing-library/react";
