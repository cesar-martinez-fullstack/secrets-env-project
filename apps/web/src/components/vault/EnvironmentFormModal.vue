<script setup lang="ts">
import type { EnvironmentDto } from '@secretvault/shared';
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

async function save(name: string): Promise<void> {
  if (props.editing) {
    await data.renameEnvironment(props.editing.id, name);
    toast.push('success', 'Ambiente renombrado', `Ahora se llama «${name}».`);
    return;
  }
  if (props.projectId === null) return;
  await data.addEnvironment(props.projectId, name);
  toast.push('success', 'Ambiente creado', `«${name}» está listo para recibir secretos.`);
}
</script>

<template>
  <NameFormModal
    :open="open"
    :title="editing ? 'Renombrar ambiente' : 'Nuevo ambiente'"
    placeholder="ej. Production, QA, Staging…"
    :submit-text="editing ? 'Guardar' : 'Crear ambiente'"
    :initial-name="editing?.name ?? ''"
    :max-length="40"
    :save="save"
    @close="emit('close')"
  />
</template>
