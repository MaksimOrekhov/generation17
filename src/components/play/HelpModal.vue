<script setup lang="ts">
import ModalShell from '../common/ModalShell.vue'

defineEmits<{ close: [] }>()
const keys = [
  ['Пробел', 'пауза / продолжить'],
  ['→', 'прожить остаток года'],
  ['1 – 4', 'выбрать вариант решения'],
  ['Enter', 'принять момент / продолжить'],
  ['Esc', 'пропустить момент']
]
</script>

<template>
  <ModalShell label="Как играть" tone="neutral" closable @close="$emit('close')">
    <div class="help">
      <h2>Как играть</h2>
      <p><b>Одна жизнь. Один корабль.</b> Время идёт само: 1× ≈ 49 секунд на год, прогресс года показан полоской сверху. Выбери фокус года и следи за летописью.</p>
      <p><b>Решения</b> останавливают время и открываются отдельным окном. Их нельзя пропустить ни на какой скорости.</p>
      <p><b>Моменты</b> — небольшие возможности внутри года. Появляются всплывающей карточкой, подсвечивают место в каюте и замедляют время. Принять момент стоит одну единицу внимания, их три на год.</p>
      <ul class="help__keys">
        <li v-for="[k, d] in keys" :key="k"><kbd>{{ k }}</kbd><span>{{ d }}</span></li>
      </ul>
      <button class="btn btn--primary" @click="$emit('close')">Понятно</button>
    </div>
  </ModalShell>
</template>

<style scoped>
.help { padding: 22px 24px; display: grid; gap: 12px; justify-items: start; }
.help h2 { font: 600 24px/1.2 var(--font-display); }
.help p { color: var(--text-soft); line-height: 1.6; }
.help b { color: var(--text); }
.help__keys { display: grid; gap: 6px; width: 100%; padding-top: 4px; }
.help__keys li { display: grid; grid-template-columns: 90px 1fr; gap: 12px; align-items: center; font-size: 13.5px; color: var(--muted); }
kbd { font: 500 11px var(--font-mono); border: 1px solid var(--line-2); padding: 2px 8px; background: var(--bg-2); color: var(--text); text-align: center; }
</style>
