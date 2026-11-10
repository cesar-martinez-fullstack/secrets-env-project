<script setup lang="ts">
import type { ProjectDto } from '@secretvault/shared';
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

async function save(name: string): Promise<void> {
  if (props.editing) {
    await data.renameProject(props.editing.id, name);
    toast.push('success', 'Proyecto renombrado', `Ahora se llama «${name}».`);
    return;
  }
  await data.addProject(name);
  toast.push('success', 'Proyecto creado', `«${name}» está listo para agrupar ambientes.`);
}
</script>

<template>
  <NameFormModal
    :open="open"
    :title="editing ? 'Renombrar proyecto' : 'Nuevo proyecto'"
    placeholder="ej. Tienda online, Backoffice…"
    :submit-text="editing ? 'Guardar' : 'Crear proyecto'"
    :initial-name="editing?.name ?? ''"
    :max-length="40"
    :save="save"
    @close="emit('close')"
  />
</template>
