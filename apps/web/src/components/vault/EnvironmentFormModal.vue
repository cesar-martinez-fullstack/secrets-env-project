<script setup lang="ts">
import type { EnvironmentDto } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import NameFormModal from '@/components/ui/NameFormModal.vue';

const props = defineProps<{
  open: boolean;
  editing: EnvironmentDto | null;
  projectId: number | null;
}>();

const emit = defineEmits<{ close: [] }>();

const data = useDataStore();
const toast = useToastStore();
const { t } = useI18n();

async function save(name: string): Promise<void> {
  if (props.editing) {
    await data.renameEnvironment(props.editing.id, name);
    toast.push('success', t('envForm.renamedTitle'), t('envForm.renamedBody', { name }));
    return;
  }
  if (props.projectId === null) return;
  await data.addEnvironment(props.projectId, name);
  toast.push('success', t('envForm.createdTitle'), t('envForm.createdBody', { name }));
}
</script>

<template>
  <NameFormModal
    :open="open"
    :title="editing ? t('envForm.rename') : t('envForm.new')"
    :placeholder="t('envForm.placeholder')"
    :submit-text="editing ? t('common.save') : t('envForm.create')"
    :initial-name="editing?.name ?? ''"
    :max-length="40"
    :save="save"
    @close="emit('close')"
  />
</template>
