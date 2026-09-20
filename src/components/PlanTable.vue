<script setup lang="ts">
import { computed, ref } from 'vue'
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
const editingDestination = ref<{ id: string; target: string }>()
const copiedDestination = ref('')
const filteredRows = computed(() =>
  props.filter === 'all' ? props.rows : props.rows.filter((row) => row.state === props.filter),
)
const selectableRows = computed(() => props.rows.filter((row) => row.state !== 'done'))
const hasSelectableRows = computed(() => selectableRows.value.length > 0)
const allSelectableRowsSelected = computed(
  () => hasSelectableRows.value && selectableRows.value.every((row) => row.enabled),
)
const someSelectableRowsSelected = computed(
  () => selectableRows.value.some((row) => row.enabled) && !allSelectableRowsSelected.value,
)
const groups = computed(() => {
  const definitions: { key: PlanRow['kind']; label: string }[] = [
    { key: 'movie', label: 'Movies' },
    { key: 'series', label: 'Shows' },
    { key: 'unknown', label: 'Unrecognized' },
  ]
  return definitions
    .map((group) => ({
      ...group,
      rows: filteredRows.value.filter((row) => row.kind === group.key),
    }))
    .filter((group) => group.rows.length)
})
function chooseCandidate(row: PlanRow, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value !== '') emit('selectMatch', row, row.candidates[Number(value)])
}
function setAllEnabled(enabled: boolean): void {
  selectableRows.value.forEach((row) => emit('setEnabled', row, enabled))
}
function destinationParts(target: string): { folders: string; filename: string } {
  const parts = target.split('/').filter(Boolean)
  return { folders: parts.slice(0, -1).join(' / '), filename: parts.at(-1) ?? '' }
}
function startEditingDestination(row: PlanRow): void {
  if (row.state !== 'done' && row.target)
    editingDestination.value = { id: row.id, target: row.target }
}
function saveDestination(row: PlanRow): void {
  if (!editingDestination.value) return
  emit('updateTarget', row, editingDestination.value.target)
  editingDestination.value = undefined
}
function cancelEditingDestination(): void {
  editingDestination.value = undefined
}
async function copyDestination(target: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(target)
    copiedDestination.value = target
  } catch {
    copiedDestination.value = ''
  }
}
</script>

<template>
  <section class="plans">
    <div class="section-head">
      <div><h2>Rename plan</h2></div>
      <div class="plan-controls">
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
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="selection-column">
              <input
                type="checkbox"
                :checked="allSelectableRowsSelected"
                :indeterminate="someSelectableRowsSelected"
                :disabled="!hasSelectableRows"
                aria-label="Select or deselect all entries"
                @change="setAllEnabled(($event.target as HTMLInputElement).checked)"
              />
            </th>
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
            <td class="destination-cell">
              <div v-if="row.target" class="destination">
                <div v-if="editingDestination?.id === row.id" class="destination-editor">
                  <input
                    v-model="editingDestination.target"
                    aria-label="Destination path"
                    autofocus
                    @keydown.enter.prevent="saveDestination(row)"
                    @keydown.esc.prevent="cancelEditingDestination"
                  />
                  <div class="destination-editor-actions">
                    <button type="button" @click="copyDestination(editingDestination.target)">
                      {{ copiedDestination === editingDestination.target ? 'Copied' : 'Copy path' }}
                    </button>
                    <button type="button" class="accent" @click="saveDestination(row)">Save</button>
                    <button type="button" @click="cancelEditingDestination">Cancel</button>
                  </div>
                </div>
                <button
                  v-else
                  type="button"
                  class="destination-preview"
                  :class="{ locked: row.state === 'done' }"
                  :title="row.target"
                  @click="startEditingDestination(row)"
                >
                  <span class="destination-folders">{{
                    destinationParts(row.target).folders
                  }}</span>
                  <b class="destination-filename">{{ destinationParts(row.target).filename }}</b>
                </button>
              </div>
              <span v-else class="destination-pending">Available after selecting a match</span>
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
