<script setup lang="ts">
import type { ProjectDto } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import NameFormModal from '@/components/ui/NameFormModal.vue';

const props = defineProps<{
  open: boolean;
  editing: ProjectDto | null;
}>();

const emit = defineEmits<{ close: [] }>();

const data = useDataStore();
const toast = useToastStore();
const { t } = useI18n();

async function save(name: string): Promise<void> {
  if (props.editing) {
    await data.renameProject(props.editing.id, name);
    toast.push('success', t('projectForm.renamedTitle'), t('projectForm.renamedBody', { name }));
    return;
  }
  await data.addProject(name);
  toast.push('success', t('projectForm.createdTitle'), t('projectForm.createdBody', { name }));
}
</script>

<template>
  <NameFormModal
    :open="open"
    :title="editing ? t('projectForm.rename') : t('projectForm.new')"
    :placeholder="t('projectForm.placeholder')"
    :submit-text="editing ? t('common.save') : t('projectForm.create')"
    :initial-name="editing?.name ?? ''"
    :max-length="40"
    :save="save"
    @close="emit('close')"
  />
</template>
