<script setup lang="ts">
defineProps<{
  title: string
  text: string
  where: string
  acceptLabel: string
  skipLabel: string
  attention: number
  /** Оставшееся время, 1 → 0. */
  left: number
}>()
defineEmits<{ accept: []; skip: [] }>()
</script>

<template>
  <div class="moment pixel-corners" role="alertdialog" aria-live="polite" :aria-label="title">
    <div class="moment__bar" :style="{ transform: `scaleX(${left})` }" />
    <div class="moment__body">
      <div class="moment__content">
        <div class="moment__head">
          <span class="moment__badge"><i />Момент</span>
          <span class="moment__where">{{ where }}</span>
        </div>
        <h4 class="moment__title">{{ title }}</h4>
        <p class="moment__text">{{ text }}</p>
      </div>
      <div class="moment__actions">
        <button class="btn btn--primary" :disabled="attention < 1" @click="$emit('accept')">
          {{ acceptLabel }}<span class="moment__cost">−1 внимание</span>
        </button>
        <button class="btn btn--sm btn--ghost" @click="$emit('skip')">{{ skipLabel }}</button>
        <span class="moment__hint">
          <template v-if="attention < 1">Внимание на этот год закончилось</template>
          <template v-else><kbd>Enter</kbd> принять · <kbd>Esc</kbd> пропустить</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.moment {
  position: relative; margin: 12px; overflow: hidden;
  background: rgba(24, 21, 39, .97); border: 2px solid var(--amber);
  box-shadow: 0 0 22px #ffb34744;
  animation: slide-up .35s steps(7), glow 1.6s ease-in-out infinite;
}
.moment__bar { height: 4px; background: repeating-linear-gradient(90deg, var(--amber) 0 6px, var(--amber-2) 6px 8px); transform-origin: left; transition: transform .2s linear; }
.moment__body { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; padding: 12px 16px 14px; align-items: end; }
.moment__content { display: grid; gap: 3px; min-width: 0; }
.moment__head { display: flex; align-items: center; gap: 10px; }
.moment__badge { display: inline-flex; align-items: center; gap: 6px; font: 600 10px/1 var(--font-mono); letter-spacing: 1.4px; text-transform: uppercase; background: var(--amber); color: var(--amber-ink); padding: 3px 7px; }
.moment__badge i { width: 6px; height: 6px; background: var(--amber-ink); animation: blink 1s steps(2) infinite; }
.moment__where { font: 400 11px var(--font-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.moment__title { font: 600 19px/1.2 var(--font-display); }
.moment__text { color: var(--text-soft); font-size: 13.5px; line-height: 1.45; }
.moment__actions { display: grid; gap: 6px; justify-items: stretch; min-width: 188px; }
.moment__cost { display: block; font: 500 10px var(--font-mono); opacity: .75; }
.moment__hint { font: 400 10.5px var(--font-mono); color: var(--faint); text-align: center; }
kbd { font: 500 10px var(--font-mono); border: 1px solid var(--line-2); padding: 0 4px; background: var(--bg-2); color: var(--muted); }
@keyframes slide-up { from { transform: translateY(14px); opacity: 0; } }
@keyframes glow { 50% { box-shadow: 0 0 32px #ffb34777; } }
@keyframes blink { 50% { opacity: .2; } }
@media (max-width: 640px) {
  .moment { margin: 8px; }
  .moment__body { grid-template-columns: minmax(0, 1fr); }
  .moment__actions { grid-template-columns: 1fr auto; min-width: 0; align-items: center; }
  .moment__hint { display: none; }
  .moment__text { font-size: 12.5px; }
}
</style>
