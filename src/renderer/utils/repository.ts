export const parseRepoKey = (
  repoKey: string,
): { organization: string; repository: string } | null => {
  const [organization, repository] = repoKey.split("/");
  if (organization && repository) {
    return { organization, repository };
  }
  return null;
};

export const REPO_NOT_IN_INTEGRATION_WARNING =
  "This repository is not connected to your GitHub integration. Tasks which run in the cloud won't be able to create PRs.";
