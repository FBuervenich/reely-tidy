<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AboutDialog from './components/AboutDialog.vue'
import BrowserSupportDialog from './components/BrowserSupportDialog.vue'
import ExecutionLog from './components/ExecutionLog.vue'
import PlanTable from './components/PlanTable.vue'
import SettingsPage from './components/SettingsPage.vue'
import WorkflowSteps from './components/WorkflowSteps.vue'
import { useMediaPlan } from './composables/useMediaPlan'
import { useSettings } from './composables/useSettings'
import { defaultNamingPreset } from './lib/naming'

const { token, rootFolder, namingPresets, activeNamingPresetId, save, deleteToken } = useSettings()
const activeNamingPreset = computed(
  () =>
    namingPresets.value.find((preset) => preset.id === activeNamingPresetId.value) ??
    namingPresets.value[0] ??
    defaultNamingPreset(),
)
const {
  rootName,
  rows,
  logs,
  filter,
  scanState,
  moveState,
  scanning,
  readingFiles,
  loadingTmdb,
  tmdbLoaded,
  tmdbTotal,
  moving,
  supportsMove,
  readyCount,
  chooseAndScan,
  selectMatch,
  searchMatches,
  useFilename,
  setEpisodes,
  setMediaKind,
  assignSidecar,
  updateTarget,
  setEnabled,
  resetPlanForSettingsChange,
  moveAll,
} = useMediaPlan(token, {
  root: rootFolder,
  preset: activeNamingPreset,
})
const page = ref<'renamer' | 'settings'>('renamer')
const aboutOpen = ref(false)
const apiCheckComplete = ref(false)
const fileSystemApiAvailable = ref(false)
const isFirefox = ref(false)
const showBrowserSupportDialog = computed(
  () => apiCheckComplete.value && !fileSystemApiAvailable.value,
)

onMounted(() => {
  fileSystemApiAvailable.value = 'showDirectoryPicker' in window && window.isSecureContext
  isFirefox.value = /firefox/i.test(navigator.userAgent)
  apiCheckComplete.value = true
})

function saveSettings(settings: {
  token: string
  rootFolder: string
  namingPresets: typeof namingPresets.value
  activeNamingPresetId: string
}): void {
  save(settings)
  resetPlanForSettingsChange()
  page.value = 'renamer'
}

function confirmMove(): void {
  if (
    window.confirm(
      `Move ${readyCount.value} selected file${readyCount.value === 1 ? '' : 's'} now? This will rename and organize them in the selected folder.`,
    )
  ) {
    void moveAll()
  }
}
</script>

<template>
  <main v-if="page === 'renamer'">
    <header class="hero">
      <div>
        <p class="eyebrow">SIMPLE LOCAL MEDIA ORGANIZER</p>
        <div class="app-name">
          <h1>ReelyTidy</h1>
          <button
            class="info-button"
            type="button"
            aria-label="About ReelyTidy"
            @click="aboutOpen = true"
          >
            i
          </button>
        </div>
      </div>
      <button class="settings" @click="page = 'settings'">
        ⚙ Settings <span :class="{ active: token }"></span>
      </button>
    </header>

    <WorkflowSteps
      :root-name="rootName"
      :scanning="scanning"
      :moving="moving"
      :ready-count="readyCount"
      :supports-move="supportsMove"
      :file-system-api-available="fileSystemApiAvailable"
      :on-choose-and-scan="chooseAndScan"
      @move="confirmMove"
    />

    <div v-if="readingFiles" class="scan-loading" role="status">
      <span class="loading-spinner" aria-hidden="true"></span><span>Loading files</span>
    </div>

    <p v-if="!supportsMove" class="notice danger">
      Native moving is not available in this browser. Execution remains disabled; there is no copy
      fallback.
    </p>
    <p v-if="scanState && !readingFiles" class="notice">{{ scanState }}</p>
    <p v-if="moveState" class="notice">{{ moveState }}</p>

    <div v-if="rows.length" class="plan-loading-container">
      <PlanTable
        :rows="rows"
        :filter="filter"
        :has-token="Boolean(token)"
        :busy="scanning || moving"
        @update:filter="filter = $event"
        @select-match="selectMatch"
        @search-matches="searchMatches"
        @use-filename="useFilename"
        @set-episodes="setEpisodes"
        @set-media-kind="setMediaKind"
        @assign-sidecar="assignSidecar"
        @update-target="updateTarget"
        @set-enabled="setEnabled"
      />
      <div v-if="loadingTmdb" class="plan-loading-overlay" role="status">
        <div>
          <span class="loading-spinner" aria-hidden="true"></span><b>Loading TMDB details</b
          ><small>TMDB metadata: {{ tmdbLoaded }} of {{ tmdbTotal }} loaded</small>
        </div>
      </div>
    </div>
    <ExecutionLog v-if="logs.length" :entries="logs" />
  </main>
  <main v-else>
    <SettingsPage
      :token="token"
      :root-folder="rootFolder"
      :naming-presets="namingPresets"
      :active-naming-preset-id="activeNamingPresetId"
      @save="saveSettings"
      @delete-token="deleteToken"
      @back="page = 'renamer'"
    />
  </main>
  <BrowserSupportDialog :open="showBrowserSupportDialog" :is-firefox="isFirefox" />
  <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />
</template>
