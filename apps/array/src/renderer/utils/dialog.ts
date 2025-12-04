interface MessageBoxOptions {
  type?: "none" | "info" | "error" | "question" | "warning";
  title?: string;
  message?: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}

/**
 * Shows a message box dialog.
 */
export async function showMessageBox(
  options: MessageBoxOptions,
): Promise<{ response: number }> {
  // Blur active element to dismiss any open tooltip
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  return window.electronAPI.showMessageBox(options);
}
