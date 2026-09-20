<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AppSettings } from '../services/storage'
import NamingTemplateBuilder from './NamingTemplateBuilder.vue'
import {
  buildTarget,
  cloneNamingPreset,
  defaultNamingPreset,
  type NamingPreset,
} from '../lib/naming'
import type { PlanRow } from '../types/plan'

const props = defineProps<{
  token: string
  rootFolder: string
  namingPresets: NamingPreset[]
  activeNamingPresetId: string
}>()
const emit = defineEmits<{ save: [settings: AppSettings]; deleteToken: []; back: [] }>()
const tokenDraft = ref(props.token)
const rootDraft = ref(props.rootFolder)
const activeTab = ref<'integration' | 'folder-structure'>('integration')
const presetsDraft = ref(props.namingPresets.map(cloneNamingPreset))
const activePresetDraftId = ref(props.activeNamingPresetId)
const previewRoot = () => rootDraft.value.trim() || '_clean'
const selectedPreset = computed(() =>
  presetsDraft.value.find((preset) => preset.id === activePresetDraftId.value),
)
const sampleMovie = {
  kind: 'movie',
  title: 'Movie Title',
  targetTitle: 'Movie Title',
  year: 2024,
  source: { name: 'video.mkv' },
} as PlanRow
const sampleSeries = {
  kind: 'series',
  title: 'Series Name',
  targetTitle: 'Series Name',
  year: 2024,
  season: 1,
  episode: 2,
  source: { name: 'video.mkv' },
} as PlanRow
const moviePreview = computed(() =>
  selectedPreset.value ? buildTarget(sampleMovie, previewRoot(), selectedPreset.value.movie) : '',
)
const seriesPreview = computed(() =>
  selectedPreset.value
    ? buildTarget(sampleSeries, previewRoot(), selectedPreset.value.series, 'Episode Title')
    : '',
)

watch(
  () => [props.token, props.rootFolder, props.namingPresets, props.activeNamingPresetId],
  () => {
    tokenDraft.value = props.token
    rootDraft.value = props.rootFolder
    presetsDraft.value = props.namingPresets.map(cloneNamingPreset)
    activePresetDraftId.value = props.activeNamingPresetId
  },
)
function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
function createPreset(): void {
  const preset = defaultNamingPreset()
  preset.id = newId()
  preset.name = `Preset ${presetsDraft.value.length + 1}`
  presetsDraft.value.push(preset)
  activePresetDraftId.value = preset.id
}
function duplicatePreset(): void {
  if (!selectedPreset.value) return
  const preset = cloneNamingPreset(selectedPreset.value)
  preset.id = newId()
  preset.name = `${preset.name} copy`
  presetsDraft.value.push(preset)
  activePresetDraftId.value = preset.id
}
function deletePreset(): void {
  if (presetsDraft.value.length < 2 || !selectedPreset.value) return
  const index = presetsDraft.value.findIndex((preset) => preset.id === selectedPreset.value!.id)
  presetsDraft.value.splice(index, 1)
  activePresetDraftId.value = presetsDraft.value[Math.max(0, index - 1)].id
}
function updateTemplate(kind: 'movie' | 'series', template: NamingPreset['movie']): void {
  if (selectedPreset.value) selectedPreset.value[kind] = template
}
function save(): void {
  emit('save', {
    token: tokenDraft.value,
    rootFolder: rootDraft.value,
    namingPresets: presetsDraft.value.map(cloneNamingPreset),
    activeNamingPresetId: activePresetDraftId.value,
  })
}
function clearToken(): void {
  tokenDraft.value = ''
  emit('deleteToken')
}
</script>

<template>
  <section class="settings-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">SETTINGS</p>
        <h1>Configuration</h1>
        <p class="sub">All values are stored in this browser only.</p>
      </div>
      <button @click="$emit('back')">← Back to ReelTidy</button>
    </div>
    <form class="settings-form" @submit.prevent="save">
      <nav class="settings-tabs" aria-label="Settings sections">
        <button
          type="button"
          :class="{ selected: activeTab === 'integration' }"
          @click="activeTab = 'integration'"
        >
          Integration
        </button>
        <button
          type="button"
          :class="{ selected: activeTab === 'folder-structure' }"
          @click="activeTab = 'folder-structure'"
        >
          Folder structure
        </button>
      </nav>
      <fieldset v-if="activeTab === 'integration'">
        <legend>TMDB integration</legend>
        <p>
          Your personal Read Access Token is stored locally and sent directly to TMDB only — never
          to an application server.
        </p>
        <label
          >TMDB API Read Access Token<input
            v-model="tokenDraft"
            type="password"
            autocomplete="off"
            placeholder="eyJhbGciOiJIUzI1NiJ9…"
        /></label>
        <button type="button" class="quiet" @click="clearToken">Delete token</button>
      </fieldset>
      <template v-else>
        <fieldset>
          <legend>Folder structure</legend>
          <p>All destination folders are created inside the selected source folder.</p>
          <label
            >Root destination folder<input v-model="rootDraft" required placeholder="_clean"
          /></label>
        </fieldset>
        <fieldset>
          <legend>Naming presets</legend>
          <p>
            Build movie and show paths from as many subfolders and filename blocks as you need. The
            “Standard” preset preserves ReelTidy’s original layout.
          </p>
          <div class="preset-controls">
            <label
              >Active preset<select v-model="activePresetDraftId">
                <option v-for="preset in presetsDraft" :key="preset.id" :value="preset.id">
                  {{ preset.name || 'Untitled preset' }}
                </option>
              </select></label
            >
            <div class="preset-actions">
              <button type="button" class="small-button" @click="createPreset">New preset</button
              ><button
                type="button"
                class="small-button"
                :disabled="!selectedPreset"
                @click="duplicatePreset"
              >
                Duplicate</button
              ><button
                type="button"
                class="small-button danger-button"
                :disabled="presetsDraft.length < 2"
                @click="deletePreset"
              >
                Delete
              </button>
            </div>
          </div>
          <label v-if="selectedPreset"
            >Preset name<input v-model="selectedPreset.name" required placeholder="My preset"
          /></label>
          <div v-if="selectedPreset" class="template-builders">
            <NamingTemplateBuilder
              title="Movies"
              :template="selectedPreset.movie"
              :allowed-tokens="['title', 'year']"
              :preview="moviePreview"
              @update:template="updateTemplate('movie', $event)"
            />
            <NamingTemplateBuilder
              title="Shows"
              :template="selectedPreset.series"
              :allowed-tokens="['title', 'year', 'season', 'episode', 'episodeTitle']"
              :preview="seriesPreview"
              @update:template="updateTemplate('series', $event)"
            />
          </div>
        </fieldset>
      </template>
      <div class="settings-actions">
        <button type="button" class="quiet" @click="$emit('back')">Cancel</button
        ><button class="accent" type="submit">Save settings</button>
      </div>
    </form>
  </section>
</template>
