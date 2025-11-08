import { useTaskPanelLayoutStore } from "@features/task-detail/stores/taskPanelLayoutStore";

export function useTaskArtifacts(taskId: string) {
  const layoutStore = useTaskPanelLayoutStore();
  const layout = layoutStore.getLayout(taskId);

  const handleOpen = (fileName: string) => {
    layoutStore.openArtifact(taskId, fileName);
  };

  const handleClose = (fileName: string) => {
    layoutStore.closeArtifact(taskId, fileName);
  };

  const handleSetActive = (fileName: string | null) => {
    layoutStore.setActiveArtifact(taskId, fileName);
  };

  return {
    openArtifacts: layout?.openArtifacts || [],
    activeArtifactId: layout?.activeArtifactId || null,
    open: handleOpen,
    close: handleClose,
    setActive: handleSetActive,
  };
}
