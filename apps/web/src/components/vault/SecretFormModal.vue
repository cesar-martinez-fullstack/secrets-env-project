<script setup lang="ts">
/**
 * Modal de creación/edición de secretos.
 * En edición, el valor se deja vacío para conservar el actual (nunca se envía al servidor).
 */
import { computed, ref, watch } from 'vue';
import type { SecretDto } from '@secretvault/shared';
import { generateSecretValue } from '@/lib/generate';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';
import AppIcon from '@/components/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps<{
  open: boolean;
  editing: SecretDto | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const data = useDataStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

const name = ref('');
const value = ref('');
const note = ref('');
const showValue = ref(false);
const submitting = ref(false);

const isEditing = computed(() => props.editing !== null);
const canSubmit = computed(
  () => name.value.trim().length > 0 && (isEditing.value || value.value.length > 0),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    showValue.value = false;
    if (props.editing) {
      name.value = props.editing.name;
      value.value = '';
      note.value = '';
    } else {
      name.value = '';
      value.value = '';
      note.value = '';
    }
  },
);

function generate(): void {
  showValue.value = true;
  value.value = generateSecretValue(24);
}

async function submit(): Promise<void> {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    if (props.editing) {
      const patch: { name?: string; value?: string; note?: string | null } = {};
      if (name.value.trim() !== props.editing.name) patch.name = name.value.trim();
      if (value.value.length > 0) patch.value = value.value;
      if (note.value.trim() !== '') patch.note = note.value.trim();
      await data.updateSecret(props.editing.id, patch);
      toast.push(
        'success',
        t('secretForm.updatedTitle'),
        t('secretForm.savedBody', { name: name.value.trim() }),
      );
    } else {
      if (data.activeEnvId === null) {
        toast.push('error', t('secretForm.noEnvTitle'), t('secretForm.noEnvBody'));
        return;
      }
      await data.addSecret({
        environmentId: data.activeEnvId,
        name: name.value.trim(),
        value: value.value,
        note: note.value.trim() || null,
      });
      toast.push(
        'success',
        t('secretForm.createdTitle'),
        t('secretForm.savedBody', { name: name.value.trim() }),
      );
    }
    emit('close');
  } catch (error) {
    toast.push('error', t('secretForm.saveFailed'), describeError(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="
      isEditing
        ? t('secretForm.titleEdit', { name: editing?.name ?? '' })
        : t('secretForm.titleNew')
    "
    max-width="md"
    @close="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label for="secret-name" class="label-text">{{ t('secretForm.name') }}</label>
        <input
          id="secret-name"
          v-model="name"
          type="text"
          required
          autofocus
          :placeholder="t('secretForm.namePlaceholder')"
          spellcheck="false"
          class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p class="mt-1 text-xs text-zinc-400">
          {{ t('secretForm.nameHint') }}
        </p>
      </div>

      <div>
        <label for="secret-value" class="label-text">{{ t('secretForm.value') }}</label>
        <div class="relative">
          <input
            id="secret-value"
            v-model="value"
            :type="showValue ? 'text' : 'password'"
            :required="!isEditing"
            :placeholder="isEditing ? t('secretForm.valueKeep') : t('secretForm.valuePlaceholder')"
            spellcheck="false"
            autocomplete="off"
            class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-[72px] font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
              :title="showValue ? t('secretForm.hide') : t('secretForm.show')"
              @click="showValue = !showValue"
            >
              <AppIcon :name="showValue ? 'eye-off' : 'eye'" :size="15" />
            </button>
            <button
              type="button"
              class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
              :title="t('secretForm.generate')"
              @click="generate"
            >
              <AppIcon name="dice" :size="15" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <label for="secret-note" class="label-text"
          >{{ t('secretForm.note') }}
          <span class="font-normal text-zinc-400">{{ t('secretForm.optional') }}</span></label
        >
        <textarea
          id="secret-note"
          v-model="note"
          rows="2"
          :placeholder="t('secretForm.notePlaceholder')"
          class="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p class="mt-1 text-xs text-zinc-400">{{ t('secretForm.noteHint') }}</p>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="!canSubmit || submitting"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="submitting" class="flex items-center gap-2">
            <AppIcon name="loader" :size="15" class="animate-spin" />
            {{ t('secretForm.saving') }}
          </span>
          <span v-else>{{ isEditing ? t('secretForm.saveChanges') : t('secretForm.create') }}</span>
        </button>
      </div>
    </form>
  </BaseModal>
</template>
