<script setup lang="ts">
import type { MoveLog } from '../types/plan'
defineProps<{ entries: MoveLog[] }>()
</script>

<template>
  <section class="plans log"><div class="section-head"><div><p class="eyebrow">LOCAL</p><h2>Execution log</h2></div></div><ul><li v-for="(entry, index) in entries" :key="index"><span :class="entry.result === 'Moved' ? 'ok' : 'bad'">{{ entry.result }}</span><code>{{ entry.source }} → {{ entry.target }}</code><small v-if="entry.message">{{ entry.message }}</small></li></ul></section>
</template>
