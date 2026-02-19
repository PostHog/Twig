import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { McpRecommendedServer } from "@renderer/api/posthogClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

const mcpKeys = {
  servers: ["mcp", "servers"] as const,
  installations: ["mcp", "installations"] as const,
};

export function useMcpServers() {
  const [installingUrl, setInstallingUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: installations, isLoading: installationsLoading } =
    useAuthenticatedQuery(mcpKeys.installations, (client) =>
      client.getMcpServerInstallations(),
    );

  const { data: servers, isLoading: serversLoading } = useAuthenticatedQuery(
    mcpKeys.servers,
    (client) => client.getMcpServers(),
  );

  const installedUrls = useMemo(
    () => new Set((installations ?? []).map((i) => i.url)),
    [installations],
  );

  const uninstallMutation = useAuthenticatedMutation(
    (client, installationId: string) =>
      client.uninstallMcpServer(installationId),
    {
      onSuccess: () => {
        toast.success("Server uninstalled");
        queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to uninstall server");
      },
    },
  );

  const installRecommendedMutation = useAuthenticatedMutation(
    (
      client,
      vars: {
        name: string;
        url: string;
        description: string;
        auth_type: "none" | "api_key" | "oauth";
        oauth_provider_kind?: string;
      },
    ) => client.installCustomMcpServer(vars),
    {
      onSuccess: (data) => {
        if ("redirect_url" in data && data.redirect_url) {
          window.open(data.redirect_url, "_blank");
        } else {
          toast.success("Server connected");
        }
        queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
        setInstallingUrl(null);
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to connect server");
        setInstallingUrl(null);
      },
    },
  );

  const installRecommended = useCallback(
    (server: McpRecommendedServer) => {
      setInstallingUrl(server.url);
      installRecommendedMutation.mutate({
        name: server.name,
        url: server.url,
        description: server.description,
        auth_type: server.auth_type,
        ...(server.oauth_provider_kind
          ? { oauth_provider_kind: server.oauth_provider_kind }
          : {}),
      });
    },
    [installRecommendedMutation],
  );

  return {
    installations,
    installationsLoading,
    servers,
    serversLoading,
    installedUrls,
    installingUrl,
    uninstallMutation,
    installRecommended,
    invalidateInstallations: () =>
      queryClient.invalidateQueries({ queryKey: mcpKeys.installations }),
  };
}
