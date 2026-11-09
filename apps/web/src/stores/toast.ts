/**
 * Store de notificaciones (toasts).
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

let nextId = 1;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function push(kind: ToastKind, title: string, description?: string): void {
    const id = nextId++;
    toasts.value.push({ id, kind, title, description });
    setTimeout(() => remove(id), 3500);
  }

  function remove(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, remove };
});
