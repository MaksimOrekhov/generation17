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
  placement: 'top' | 'bottom'
}>()
defineEmits<{ accept: []; skip: [] }>()
</script>

<template>
  <div class="moment" :class="`moment--${placement}`" role="alertdialog" aria-live="polite" :aria-label="title">
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
  position: absolute; left: 10px; right: 10px; z-index: 5; max-width: 640px;
  background: rgba(24, 21, 39, .97); border: 2px solid var(--amber); overflow: hidden;
  box-shadow: 0 0 0 2px #0e0c17, 0 0 24px #ffb34755, 0 12px 30px #000a;
  animation: glow 1.6s ease-in-out infinite;
}
.moment--bottom { bottom: 10px; animation-name: slide-up, glow; animation-duration: .35s, 1.6s; animation-timing-function: steps(7), ease-in-out; animation-iteration-count: 1, infinite; }
.moment--top { top: 44px; animation-name: slide-down, glow; animation-duration: .35s, 1.6s; animation-timing-function: steps(7), ease-in-out; animation-iteration-count: 1, infinite; }
.moment__bar { height: 4px; background: repeating-linear-gradient(90deg, var(--amber) 0 6px, var(--amber-2) 6px 8px); transform-origin: left; transition: transform .2s linear; }
.moment__body { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; padding: 10px 14px 12px; align-items: end; }
.moment__content { display: grid; gap: 3px; min-width: 0; }
.moment__head { display: flex; align-items: center; gap: 10px; }
.moment__badge { display: inline-flex; align-items: center; gap: 6px; font: 600 10px/1 var(--font-mono); letter-spacing: 1.4px; text-transform: uppercase; background: var(--amber); color: var(--amber-ink); padding: 3px 7px; }
.moment__badge i { width: 6px; height: 6px; background: var(--amber-ink); animation: blink 1s steps(2) infinite; }
.moment__where { font: 400 11px var(--font-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.moment__title { font: 600 19px/1.2 var(--font-display); }
.moment__text { color: var(--text-soft); font-size: 13px; line-height: 1.45; }
.moment__actions { display: grid; gap: 6px; justify-items: stretch; min-width: 188px; }
.moment__cost { display: block; font: 500 10px var(--font-mono); opacity: .75; }
.moment__hint { font: 400 10.5px var(--font-mono); color: var(--faint); text-align: center; }
kbd { font: 500 10px var(--font-mono); border: 1px solid var(--line-2); padding: 0 4px; background: var(--bg-2); color: var(--muted); }
@keyframes slide-up { from { transform: translateY(24px); opacity: 0; } }
@keyframes slide-down { from { transform: translateY(-24px); opacity: 0; } }
@keyframes glow { 50% { box-shadow: 0 0 0 2px #0e0c17, 0 0 34px #ffb34799, 0 12px 30px #000a; } }
@keyframes blink { 50% { opacity: .2; } }
@media (max-width: 640px) {
  /* на узком экране сцена маленькая: карточка не перекрывает её, а встаёт под ней */
  .moment, .moment--top, .moment--bottom { position: relative; inset: auto; max-width: none; border-width: 2px 0 0; box-shadow: none; animation: slide-up .35s steps(7); }
  .moment__body { grid-template-columns: minmax(0, 1fr); }
  .moment__actions { grid-template-columns: 1fr auto; min-width: 0; align-items: center; }
  .moment__hint { display: none; }
  .moment__text { font-size: 12.5px; }
}

/* The moment stays readable without obscuring the compact scene. */
.moment, .moment--top, .moment--bottom { position: relative; inset: auto; max-width: none; border-width: 2px 0 0; box-shadow: none; animation: slide-up .35s steps(7); }
</style>
