<script setup lang="ts">
import { computed } from 'vue'
import { pad } from '../lib/media'
import { posterUrl, type TmdbResult } from '../lib/tmdb'
import type { PlanFilter, PlanRow } from '../types/plan'

const emit = defineEmits<{
  'update:filter': [filter: PlanFilter]
  selectMatch: [row: PlanRow, match: TmdbResult]
  updateTarget: [row: PlanRow, target: string]
  setEnabled: [row: PlanRow, enabled: boolean]
}>()
const filters: { value: PlanFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'conflict', label: 'Conflict' },
  { value: 'needs-choice', label: 'Selection required' },
  { value: 'unrecognized', label: 'Unrecognized' },
]
const statusLabels = {
  ready: 'Ready',
  conflict: 'Conflict',
  unrecognized: 'Unrecognized',
  'needs-choice': 'Selection required',
  error: 'Error',
  done: 'Moved',
}
const props = defineProps<{ rows: PlanRow[]; filter: PlanFilter; hasToken: boolean }>()
const groups = computed(() => {
  const definitions: { key: PlanRow['kind']; label: string }[] = [
    { key: 'movie', label: 'Movies' },
    { key: 'series', label: 'Shows' },
    { key: 'unknown', label: 'Unrecognized' },
  ]
  return definitions
    .map((group) => ({ ...group, rows: props.rows.filter((row) => row.kind === group.key) }))
    .filter((group) => group.rows.length)
})
function chooseCandidate(row: PlanRow, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value !== '') emit('selectMatch', row, row.candidates[Number(value)])
}
</script>

<template>
  <section class="plans">
    <div class="section-head">
      <div><h2>Rename plan</h2></div>
      <nav>
        <button
          v-for="item in filters"
          :key="item.value"
          :class="{ selected: filter === item.value }"
          @click="emit('update:filter', item.value)"
        >
          {{ item.label }}
        </button>
      </nav>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="selection-column">Select</th>
            <th>Source</th>
            <th>Detected</th>
            <th>TMDB</th>
            <th>Destination</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.key">
          <tr class="media-group">
            <th colspan="6">
              {{ group.label }} <span>{{ group.rows.length }}</span>
            </th>
          </tr>
          <tr v-for="row in group.rows" :key="row.id" :class="{ disabled: !row.enabled }">
            <td class="selection-column">
              <input
                :checked="row.enabled"
                type="checkbox"
                :aria-label="`Select ${row.source.name}`"
                :disabled="row.state === 'done'"
                @change="emit('setEnabled', row, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>
              <code>{{ row.source.path }}</code
              ><small v-if="row.sidecars.length"
                >+ {{ row.sidecars.map((s) => s.name).join(', ') }}</small
              >
            </td>
            <td>
              <b>{{ row.kind === 'movie' ? 'Movie' : row.kind === 'series' ? 'Show' : '—' }}</b
              ><small
                >{{ row.title || 'Unrecognized'
                }}{{ row.season ? ` · S${pad(row.season)}E${pad(row.episode!)}` : '' }}</small
              >
            </td>
            <td class="tmdb">
              <template v-if="row.match"
                ><div class="tmdb-match" tabindex="0">
                  <img
                    v-if="posterUrl(row.match.posterPath)"
                    :src="posterUrl(row.match.posterPath)"
                    alt=""
                  />
                  <div>
                    <b>{{ row.match.title }}</b
                    ><small>{{ row.match.year || 'Year unknown' }}</small>
                  </div>
                  <aside class="tmdb-tooltip" role="tooltip">
                    <img
                      v-if="posterUrl(row.match.posterPath)"
                      :src="posterUrl(row.match.posterPath)"
                      alt=""
                    />
                    <div>
                      <b>{{ row.match.title }}</b
                      ><small
                        >{{ row.match.year || 'Year unknown' }} · TMDB #{{ row.match.id }}</small
                      >
                      <p>
                        {{
                          row.match.overview || 'No description is available for this TMDB entry.'
                        }}
                      </p>
                    </div>
                  </aside>
                </div></template
              ><template v-else-if="row.candidates.length"
                ><select @change="chooseCandidate(row, $event)">
                  <option value="">Select a match …</option>
                  <option v-for="(candidate, i) in row.candidates" :key="candidate.id" :value="i">
                    {{ candidate.title }} ({{ candidate.year || '—' }})
                  </option>
                </select></template
              ><small v-else>{{
                row.searching ? 'Searching …' : hasToken ? 'No match' : 'No token'
              }}</small>
            </td>
            <td>
              <input
                :value="row.target"
                :disabled="row.state === 'done'"
                @change="emit('updateTarget', row, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <span class="status" :class="row.state">{{ statusLabels[row.state] }}</span
              ><small v-if="row.error">{{ row.error }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
