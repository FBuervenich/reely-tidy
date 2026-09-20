<script setup lang="ts">
import type { MoveLog } from '../types/plan'
defineProps<{ entries: MoveLog[] }>()
</script>

<template>
  <section class="plans log"><div class="section-head"><div><p class="eyebrow">LOKAL</p><h2>Ausführungsprotokoll</h2></div></div><ul><li v-for="(entry, index) in entries" :key="index"><span :class="entry.result === 'Verschoben' ? 'ok' : 'bad'">{{ entry.result }}</span><code>{{ entry.source }} → {{ entry.target }}</code><small v-if="entry.message">{{ entry.message }}</small></li></ul></section>
</template>
