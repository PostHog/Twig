import { useQuery } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { useAuthStore } from "../stores/authStore";

export interface UserData {
  id: number;
  uuid: string;
  first_name: string;
  last_name?: string;
  email: string;
  organization?: {
    id: string;
    name: string;
  };
  team?: {
    id: number;
    name: string;
  };
}

export function useUserQuery() {
  const { cloudRegion, oauthAccessToken, getCloudUrlFromRegion } =
    useAuthStore();

  return useQuery({
    queryKey: ["user", "me"],
    queryFn: async (): Promise<UserData> => {
      if (!cloudRegion) throw new Error("No cloud region");
      const baseUrl = getCloudUrlFromRegion(cloudRegion);
      const response = await fetch(`${baseUrl}/api/users/@me/`, {
        headers: {
          Authorization: `Bearer ${oauthAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user: ${response.statusText}`);
      }

      const data: UserData = await response.json();

      posthog.identify(data.uuid, {
        email: data.email,
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",
      });

      return data;
    },
    enabled: !!cloudRegion && !!oauthAccessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
