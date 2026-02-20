import { useAuthStore } from "@features/auth/stores/authStore";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

  const {
    data: currentUser,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => client?.getCurrentUser(),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  const projects = useMemo(() => {
    if (!currentUser?.organization) return [];

    const rawTeams = Array.isArray(currentUser.organization.teams)
      ? currentUser.organization.teams
      : [];
    const teams = rawTeams.filter(
      (t): t is { id: number; name?: string } =>
        t != null && typeof t === "object" && typeof t.id === "number",
    );
    const orgName = currentUser.organization.name ?? "Unknown Organization";
    const orgId = currentUser.organization.id ?? "";

    const teamMap = new Map(teams.map((t) => [t.id, t]));

    return availableProjectIds
      .map((id) => {
        const team = teamMap.get(id);
        if (!team) return null;
        return {
          id,
          name: team.name ?? `Project ${id}`,
          organization: { id: orgId, name: orgName },
        };
      })
      .filter((p): p is ProjectInfo => p !== null);
  }, [currentUser, availableProjectIds]);

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const groupedProjects = groupProjectsByOrg(projects);

  return {
    projects,
    groupedProjects,
    currentProject,
    currentProjectId,
    currentUser: currentUser ?? null,
    isLoading,
    error,
  };
}
