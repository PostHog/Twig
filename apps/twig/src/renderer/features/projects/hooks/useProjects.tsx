import { useAuthStore } from "@features/auth/stores/authStore";
import { useQuery } from "@tanstack/react-query";

export interface ProjectInfo {
  id: number;
  name: string;
  organization: { id: string; name: string };
}

export interface GroupedProjects {
  orgId: string;
  orgName: string;
  projects: ProjectInfo[];
}

export function groupProjectsByOrg(projects: ProjectInfo[]): GroupedProjects[] {
  const orgMap = new Map<string, GroupedProjects>();

  for (const project of projects) {
    const orgId = project.organization.id;
    if (!orgMap.has(orgId)) {
      orgMap.set(orgId, {
        orgId,
        orgName: project.organization.name,
        projects: [],
      });
    }
    orgMap.get(orgId)?.projects.push(project);
  }

  return Array.from(orgMap.values());
}

export function useProjects() {
  const availableProjectIds = useAuthStore((s) => s.availableProjectIds);
  const client = useAuthStore((s) => s.client);
  const currentProjectId = useAuthStore((s) => s.projectId);

  const query = useQuery({
    queryKey: ["projects", availableProjectIds],
    queryFn: async () => {
      if (!client || availableProjectIds.length === 0) {
        return [];
      }
      return client.getProjectDetails(availableProjectIds);
    },
    enabled: !!client && availableProjectIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const currentProject = query.data?.find((p) => p.id === currentProjectId);
  const groupedProjects = query.data ? groupProjectsByOrg(query.data) : [];

  return {
    projects: query.data ?? [],
    groupedProjects,
    currentProject,
    currentProjectId,
    isLoading: query.isLoading,
    error: query.error,
  };
}
