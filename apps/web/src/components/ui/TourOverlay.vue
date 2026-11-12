<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { placeCard, targetSelector } from '@/lib/tour';
import type { Box, Point } from '@/lib/tour';
import { useI18n } from '@/i18n/use-i18n';
import { useTourStore } from '@/stores/tour';

const HIGHLIGHT_PADDING = 6;

const tour = useTourStore();
const { t } = useI18n();

const card = ref<HTMLElement | null>(null);
const nextButton = ref<HTMLButtonElement | null>(null);
const box = ref<Box | null>(null);
const cardPosition = ref<Point>({ top: 0, left: 0 });

const highlightStyle = computed(() => {
  const target = box.value;
  if (!target) return { display: 'none' };
  return {
    top: `${target.top - HIGHLIGHT_PADDING}px`,
    left: `${target.left - HIGHLIGHT_PADDING}px`,
    width: `${target.width + HIGHLIGHT_PADDING * 2}px`,
    height: `${target.height + HIGHLIGHT_PADDING * 2}px`,
  };
});

const cardStyle = computed(() => ({
  top: `${cardPosition.value.top}px`,
  left: `${cardPosition.value.left}px`,
}));

function measure(): void {
  const id = tour.current;
  const element = id ? document.querySelector(targetSelector(id)) : null;
  if (!element || !card.value) return;
  const { top, left, width, height } = element.getBoundingClientRect();
  box.value = { top, left, width, height };
  cardPosition.value = placeCard(
    { top: top - HIGHLIGHT_PADDING, left, width, height: height + HIGHLIGHT_PADDING * 2 },
    { width: card.value.offsetWidth, height: card.value.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
}

async function showCurrentStep(): Promise<void> {
  const id = tour.current;
  if (!id) return;
  document.querySelector(targetSelector(id))?.scrollIntoView({ block: 'nearest' });
  await nextTick();
  measure();
  nextButton.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (tour.active && event.key === 'Escape') tour.finish();
}

watch(
  () => [tour.active, tour.current] as const,
  ([active]) => {
    if (active) void showCurrentStep();
  },
  { flush: 'post' },
);

onMounted(() => {
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, true);
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  window.removeEventListener('scroll', measure, true);
  window.removeEventListener('keydown', onKeydown);
});

const ghostButton =
  'rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
</script>

<template>
  <Teleport to="body">
    <div v-if="tour.active && tour.current" class="fixed inset-0 z-[55]" data-testid="tour">
      <div class="absolute inset-0" aria-hidden="true" />
      <div
        class="pointer-events-none absolute rounded-xl ring-2 ring-indigo-500 shadow-[0_0_0_9999px_rgba(9,9,11,0.55)] transition-all duration-200"
        :style="highlightStyle"
        aria-hidden="true"
      />
      <div
        ref="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        class="card absolute w-80 max-w-[calc(100vw-1rem)] p-5"
        :style="cardStyle"
      >
        <p class="mb-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
          {{ t('tour.progress', { current: tour.index + 1, total: tour.steps.length }) }}
        </p>
        <h2
          id="tour-title"
          class="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          data-testid="tour-title"
        >
          {{ t(`tour.${tour.current}.title`) }}
        </h2>
        <p class="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ t(`tour.${tour.current}.body`) }}
        </p>
        <div class="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            class="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            data-testid="tour-skip"
            @click="tour.finish()"
          >
            {{ t('tour.skip') }}
          </button>
          <div class="flex gap-2">
            <button
              v-if="tour.index > 0"
              type="button"
              :class="ghostButton"
              data-testid="tour-back"
              @click="tour.back()"
            >
              {{ t('tour.back') }}
            </button>
            <button
              ref="nextButton"
              type="button"
              class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              data-testid="tour-next"
              @click="tour.next()"
            >
              {{ tour.isLast ? t('tour.done') : t('tour.next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
