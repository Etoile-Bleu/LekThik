import { create } from 'zustand';

import { fetchTemplates } from './boardsApi';
import type { TemplateCatalogue } from './boardsApi';
import { notifyError } from './toastStore';

type TemplateStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TemplateState {
  catalogue: TemplateCatalogue | null;
  status: TemplateStatus;
  load: () => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  catalogue: null,
  status: 'idle',

  load: async () => {
    if (get().status === 'ready' || get().status === 'loading') {
      return;
    }
    set({ status: 'loading' });
    try {
      set({ catalogue: await fetchTemplates(), status: 'ready' });
    } catch (error) {
      set({ status: 'error' });
      notifyError(error, 'Could not load the templates.');
    }
  },
}));
