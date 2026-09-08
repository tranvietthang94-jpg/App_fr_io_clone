import { create } from 'zustand';
import { uploadFileWithResume } from '../uploadManager';

/**
 * App-wide upload queue. Lives outside any page component so an upload keeps
 * running (and keeps its progress visible) no matter where the user navigates
 * — previously the queue was state on the project page, so opening another
 * video made the progress disappear and any error left a dead bar behind.
 */
export interface UploadTask {
  id: string;
  name: string;
  progress: number;
  /** Epoch ms when the current attempt started — used for ETA. */
  startedAt?: number;
  status: 'uploading' | 'done' | 'error';
  errorMessage?: string;
  file: File;
  projectId: string;
  assetGroupId?: string;
  folderId?: string | null;
  onDone?: () => void;
}

interface UploadState {
  tasks: UploadTask[];
  enqueue: (input: {
    file: File;
    projectId: string;
    assetGroupId?: string;
    folderId?: string | null;
    onDone?: () => void;
  }) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
}

async function runTask(task: UploadTask, update: (patch: Partial<UploadTask>) => void) {
  update({ status: 'uploading', progress: 0, startedAt: Date.now(), errorMessage: undefined });
  try {
    await uploadFileWithResume(
      task.file,
      task.projectId,
      { assetGroupId: task.assetGroupId, folderId: task.folderId ?? undefined },
      (percent) => update({ progress: percent }),
    );
    update({ status: 'done', progress: 100 });
    // Fire-and-forget: callers refresh their own lists. Runs even after the
    // originating page unmounted (setState on an unmounted page is a no-op).
    task.onDone?.();
    // Keep the finished row around briefly so the user sees it complete.
    setTimeout(() => {
      useUploadStore.getState().dismiss(task.id);
    }, 4000);
  } catch (err: any) {
    update({
      status: 'error',
      errorMessage: err?.response?.status === 401 ? 'Phiên đăng nhập hết hạn' : 'Mất kết nối — thử lại',
    });
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  tasks: [],

  enqueue: (input) => {
    const task: UploadTask = {
      id: `${input.file.name}-${input.file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: input.file.name,
      progress: 0,
      status: 'uploading',
      file: input.file,
      projectId: input.projectId,
      assetGroupId: input.assetGroupId,
      folderId: input.folderId,
      onDone: input.onDone,
    };
    set((state) => ({ tasks: [...state.tasks, task] }));
    void runTask(task, (patch) => {
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
      }));
    });
  },

  retry: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    // Resume is server-side: already-uploaded chunks are skipped, so retrying
    // a half-finished file never starts over.
    if (task && task.status === 'error') void runTask(task, (patch) => {
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    });
  },

  dismiss: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}));
