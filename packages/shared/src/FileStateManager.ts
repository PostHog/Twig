export interface FileState {
  path: string;
  mtime: number;
  content: string;
  isDirty: boolean;
  frozenContent: string | null;
}

export class FileStateManager {
  private fileStates = new Map<string, FileState>();

  register(path: string, initialContent: string, mtime: number): void {
    this.fileStates.set(path, {
      path,
      mtime,
      content: initialContent,
      isDirty: false,
      frozenContent: null,
    });
  }

  unregister(path: string): void {
    this.fileStates.delete(path);
  }

  getState(path: string): FileState | undefined {
    return this.fileStates.get(path);
  }

  setDirty(path: string, dirty: boolean): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.isDirty = dirty;
    }
  }

  checkForExternalChanges(path: string, currentMtime: number): boolean {
    const state = this.fileStates.get(path);
    if (!state) return false;
    return currentMtime !== state.mtime;
  }

  updateMtime(path: string, newMtime: number): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.mtime = newMtime;
    }
  }

  updateContent(path: string, content: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.content = content;
    }
  }

  freezeContent(path: string, content: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.frozenContent = content;
    }
  }

  unfreezeContent(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.frozenContent = null;
    }
  }

  getEffectiveContent(path: string): string | null {
    const state = this.fileStates.get(path);
    if (!state) return null;
    return state.frozenContent ?? state.content;
  }
}
