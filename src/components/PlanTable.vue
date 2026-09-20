<script setup lang="ts">
import { pad } from '../lib/media'
import { posterUrl, type TmdbResult } from '../lib/tmdb'
import type { PlanFilter, PlanRow } from '../types/plan'

defineProps<{ rows: PlanRow[]; filter: PlanFilter; hasToken: boolean }>()
const emit = defineEmits<{
  'update:filter': [filter: PlanFilter]
  selectMatch: [row: PlanRow, match: TmdbResult]
  updateTarget: [row: PlanRow, target: string]
  setEnabled: [row: PlanRow, enabled: boolean]
}>()
const filters: { value: PlanFilter; label: string }[] = [
  { value: 'all', label: 'Alle' }, { value: 'ready', label: 'Bereit' },
  { value: 'conflict', label: 'Konflikt' }, { value: 'unrecognized', label: 'Nicht erkannt' }
]
const statusLabels = { ready: 'Bereit', conflict: 'Konflikt', unrecognized: 'Nicht erkannt', 'needs-choice': 'Auswahl nötig', error: 'Fehler', done: 'Verschoben' }
function chooseCandidate(row: PlanRow, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value !== '') emit('selectMatch', row, row.candidates[Number(value)])
}
</script>

<template>
  <section class="plans">
    <div class="section-head"><div><p class="eyebrow">DRY-RUN</p><h2>Umbenennungsplan</h2></div><nav><button v-for="item in filters" :key="item.value" :class="{ selected: filter === item.value }" @click="emit('update:filter', item.value)">{{ item.label }}</button></nav></div>
    <div class="table-wrap"><table><thead><tr><th>Quelle</th><th>Erkannt</th><th>TMDB</th><th>Zielpfad</th><th>Status</th></tr></thead><tbody>
      <tr v-for="row in rows" :key="row.id" :class="{ disabled: !row.enabled }">
        <td><label class="check"><input :checked="row.enabled" type="checkbox" :disabled="row.state === 'done'" @change="emit('setEnabled', row, ($event.target as HTMLInputElement).checked)" /><code>{{ row.source.path }}</code></label><small v-if="row.subtitles.length">+ {{ row.subtitles.map(s => s.name).join(', ') }}</small></td>
        <td><b>{{ row.kind === 'movie' ? 'Film' : row.kind === 'series' ? 'Serie' : '—' }}</b><small>{{ row.title || 'Nicht erkannt' }}{{ row.season ? ` · S${pad(row.season)}E${pad(row.episode!)}` : '' }}</small></td>
        <td class="tmdb"><template v-if="row.match"><img v-if="posterUrl(row.match.posterPath)" :src="posterUrl(row.match.posterPath)" alt="" /><div><b>{{ row.match.title }}</b><small>{{ row.match.year || 'Jahr unbekannt' }}</small></div></template><template v-else-if="row.candidates.length"><select @change="chooseCandidate(row, $event)"><option value="">Treffer auswählen …</option><option v-for="(candidate, i) in row.candidates" :key="candidate.id" :value="i">{{ candidate.title }} ({{ candidate.year || '—' }})</option></select></template><small v-else>{{ row.searching ? 'Suche …' : hasToken ? 'Kein Treffer' : 'Ohne Token' }}</small></td>
        <td><input :value="row.target" :disabled="row.state === 'done'" @change="emit('updateTarget', row, ($event.target as HTMLInputElement).value)" /></td>
        <td><span class="status" :class="row.state">{{ statusLabels[row.state] }}</span><small v-if="row.error">{{ row.error }}</small></td>
      </tr>
    </tbody></table></div>
  </section>
</template>
