import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { SidebarItem } from "../SidebarItem";

interface Repository {
  fullPath: string;
  name: string;
}

interface ProjectsItemProps {
  repositories: Repository[];
  isLoading: boolean;
  activeRepository: string | null;
  onProjectClick: (repository: string) => void;
}

export function ProjectsItem({
  repositories,
  isLoading,
  activeRepository,
  onProjectClick,
}: ProjectsItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <SidebarItem
        depth={0}
        icon={<FolderIcon size={12} />}
        label="Projects"
        onClick={() => setIsExpanded(!isExpanded)}
        endContent={
          <span className="ml-auto flex items-center">
            {isExpanded ? (
              <CaretDownIcon size={12} weight="fill" />
            ) : (
              <CaretRightIcon size={12} weight="fill" />
            )}
          </span>
        }
      />
      {isExpanded &&
        (isLoading ? (
          <SidebarItem depth={1} label="Loading..." />
        ) : repositories.length > 0 ? (
          repositories.map((repo) => (
            <SidebarItem
              key={repo.fullPath}
              depth={1}
              label={repo.name}
              isActive={activeRepository === repo.fullPath}
              onClick={() => onProjectClick(repo.fullPath)}
            />
          ))
        ) : (
          <SidebarItem depth={1} label="No projects found" />
        ))}
    </>
  );
}
