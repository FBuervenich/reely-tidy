<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { pad } from '../lib/media'
import { posterUrl, type TmdbResult } from '../lib/tmdb'
import type { PlanFilter, PlanRow } from '../types/plan'

const emit = defineEmits<{
  'update:filter': [filter: PlanFilter]
  selectMatch: [row: PlanRow, match: TmdbResult]
  updateTarget: [row: PlanRow, target: string]
  searchMatches: [row: PlanRow, query: string]
  useFilename: [row: PlanRow]
  setEpisodes: [row: PlanRow, season: number, episodes: number[]]
  assignSidecar: [path: string, rowId: string]
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
const props = defineProps<{
  rows: PlanRow[]
  filter: PlanFilter
  hasToken: boolean
  busy?: boolean
}>()
const matchEditor = ref<PlanRow>()
const matchDialog = ref<HTMLDialogElement>()
const matchQuery = ref('')
const seasonInput = ref(1)
const episodeInput = ref('1')
async function editMatch(row: PlanRow): Promise<void> {
  matchEditor.value = row
  matchQuery.value = row.detection.title
  seasonInput.value = row.season ?? 1
  episodeInput.value = (row.episodes ?? [row.episode ?? 1]).join(', ')
  await nextTick()
  matchDialog.value?.showModal()
}
function confirmMatch(candidate: TmdbResult): void {
  if (matchEditor.value) emit('selectMatch', matchEditor.value, candidate)
  matchDialog.value?.close()
}
function chooseFilename(): void {
  if (matchEditor.value) emit('useFilename', matchEditor.value)
  matchDialog.value?.close()
}
function saveEpisodes(): void {
  if (!matchEditor.value) return
  emit(
    'setEpisodes',
    matchEditor.value,
    Number(seasonInput.value),
    episodeInput.value.split(/[, ]+/).filter(Boolean).map(Number),
  )
}
const editingDestination = ref<{ id: string; target: string }>()
const destinationDialog = ref<HTMLDialogElement>()
const copiedDestination = ref('')
const filteredRows = computed(() =>
  props.filter === 'all' ? props.rows : props.rows.filter((row) => row.state === props.filter),
)
const selectableRows = computed(() => props.rows.filter((row) => row.state === 'ready'))
const hasSelectableRows = computed(() => selectableRows.value.length > 0)
const allSelectableRowsSelected = computed(
  () => hasSelectableRows.value && selectableRows.value.every((row) => row.enabled),
)
const someSelectableRowsSelected = computed(
  () => selectableRows.value.some((row) => row.enabled) && !allSelectableRowsSelected.value,
)
const editingRow = computed(() =>
  editingDestination.value
    ? props.rows.find((row) => row.id === editingDestination.value?.id)
    : undefined,
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
async function startEditingDestination(row: PlanRow): Promise<void> {
  if (row.state === 'done' || !row.target) return

  editingDestination.value = { id: row.id, target: row.target }
  await nextTick()
  destinationDialog.value?.showModal()
}
function saveDestination(): void {
  if (!editingDestination.value || !editingRow.value) return
  emit('updateTarget', editingRow.value, editingDestination.value.target)
  destinationDialog.value?.close()
}
function cancelEditingDestination(): void {
  destinationDialog.value?.close()
}
function clearDestinationEditor(): void {
  editingDestination.value = undefined
  copiedDestination.value = ''
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
  <section class="plans" :inert="busy">
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
        <colgroup>
          <col class="selection-column" />
          <col class="source-column" />
          <col class="detected-column" />
          <col class="tmdb-column" />
          <col class="destination-column" />
          <col class="status-column" />
        </colgroup>
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
                v-if="row.state === 'ready'"
                :checked="row.enabled"
                type="checkbox"
                :aria-label="`Select ${row.source.name}`"
                @change="emit('setEnabled', row, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>
              <code>{{ row.source.path }}</code
              ><small v-if="row.sidecars.length"
                >+ {{ row.sidecars.map((s) => s.name).join(', ') }}</small
              >
              <label
                v-for="choice in row.sidecarChoices"
                :key="choice.file.path"
                class="sidecar-choice"
              >
                Assign {{ choice.file.name }}
                <select
                  :disabled="row.searching"
                  @change="
                    emit(
                      'assignSidecar',
                      choice.file.path,
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option disabled selected value="pending">Choose video …</option>
                  <option value="">Leave sidecar in place</option>
                  <option v-for="id in choice.rowIds" :key="id" :value="id">
                    {{ rows.find((item) => item.id === id)?.source.name }}
                  </option>
                </select>
              </label>
            </td>
            <td>
              <b>{{ row.kind === 'movie' ? 'Movie' : row.kind === 'series' ? 'Show' : '—' }}</b
              ><small
                >{{ row.title || 'Unrecognized'
                }}{{
                  row.season !== undefined
                    ? ` · S${pad(row.season)}${(row.episodes ?? []).map((episode) => `E${pad(episode)}`).join('')}`
                    : row.airDate
                      ? ` · ${row.airDate}`
                      : ''
                }}</small
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
                ><select :disabled="row.searching" @change="chooseCandidate(row, $event)">
                  <option value="">Select a match …</option>
                  <option v-for="(candidate, i) in row.candidates" :key="candidate.id" :value="i">
                    {{ candidate.title }} ({{ candidate.year || '—' }})
                  </option>
                </select></template
              ><small v-else>{{
                row.searching ? 'Searching …' : hasToken ? 'No match' : 'No token'
              }}</small>
              <small class="match-confidence">{{
                row.confidence === 'confirmed'
                  ? 'User confirmed'
                  : row.confidence === 'metadata'
                    ? 'Metadata match'
                    : 'Unverified filename suggestion'
              }}</small>
              <small v-if="row.kind === 'series'">{{
                row.episodeValidation === 'valid'
                  ? 'Episodes verified'
                  : row.episodeValidation === 'missing'
                    ? 'Episode missing — review required'
                    : 'Episodes not yet validated'
              }}</small>
              <small v-if="row.matchReasons.length">{{ row.matchReasons.join('; ') }}</small>
              <details v-if="row.evidence.length">
                <summary>Detection context</summary>
                <small>{{ row.evidence.join('; ') }}</small>
              </details>
              <button
                v-if="row.state !== 'done'"
                type="button"
                :disabled="row.searching"
                @click="editMatch(row)"
              >
                {{ row.match ? 'Change match' : 'Search / choose match' }}
              </button>
            </td>
            <td class="destination-cell">
              <div v-if="row.target" class="destination">
                <button
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
    <dialog
      ref="matchDialog"
      class="destination-dialog match-dialog"
      @close="matchEditor = undefined"
    >
      <div v-if="matchEditor">
        <h2>Change match</h2>
        <p v-if="matchEditor.kind === 'series'">
          A confirmed series match applies to this series folder. Episode numbers are validated
          separately.
        </p>
        <form @submit.prevent="emit('searchMatches', matchEditor, matchQuery)">
          <label
            >Title, tmdb:123 or tt1234567<input
              v-model="matchQuery"
              autofocus
              aria-label="Title or provider ID"
          /></label>
          <button type="submit" :disabled="matchEditor.searching || !hasToken">
            {{ matchEditor.searching ? 'Searching …' : 'Search' }}
          </button>
        </form>
        <p v-if="!hasToken">
          Add a TMDB token in Settings to search. You can still correct episode numbers or use the
          filename suggestion.
        </p>
        <p v-if="matchEditor.lookupError" role="status">{{ matchEditor.lookupError }}</p>
        <div class="match-candidates">
          <button
            v-for="candidate in matchEditor.candidates"
            :key="candidate.id"
            type="button"
            :disabled="matchEditor.searching"
            @click="confirmMatch(candidate)"
          >
            <b>{{ candidate.title }} ({{ candidate.year || '—' }}) · TMDB {{ candidate.id }}</b>
            <small>Score {{ candidate.score }} · {{ candidate.reasons?.join('; ') }}</small>
            <small v-if="candidate.contradictions?.length">{{
              candidate.contradictions.join('; ')
            }}</small>
          </button>
        </div>
        <form v-if="matchEditor.kind === 'series'" @submit.prevent="saveEpisodes">
          <label
            >Season<input v-model.number="seasonInput" type="number" min="0" max="99" required
          /></label>
          <label
            >Episodes (comma-separated)<input v-model="episodeInput" pattern="[0-9, ]+" required
          /></label>
          <button type="submit" :disabled="matchEditor.searching">
            Set episode numbers / validate
          </button>
        </form>
        <p v-if="matchEditor.error" role="status">{{ matchEditor.error }}</p>
        <div class="dialog-actions">
          <button type="button" :disabled="matchEditor.searching" @click="chooseFilename">
            Use filename / forget saved match
          </button>
          <button type="button" @click="matchDialog?.close()">Close</button>
        </div>
      </div>
    </dialog>
    <dialog ref="destinationDialog" class="destination-dialog" @close="clearDestinationEditor">
      <form v-if="editingDestination" @submit.prevent="saveDestination">
        <p class="eyebrow">DESTINATION</p>
        <h2>Edit destination</h2>
        <p>Change the full relative path. The file stays inside the selected source folder.</p>
        <label>
          Destination path
          <input v-model="editingDestination.target" autofocus aria-label="Destination path" />
        </label>
        <div class="dialog-actions">
          <button type="button" @click="copyDestination(editingDestination.target)">
            {{ copiedDestination === editingDestination.target ? 'Copied' : 'Copy path' }}
          </button>
          <span>
            <button type="button" @click="cancelEditingDestination">Cancel</button>
            <button class="accent" type="submit">Save</button>
          </span>
        </div>
      </form>
    </dialog>
  </section>
</template>
