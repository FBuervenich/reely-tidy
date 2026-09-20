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

const {
  token,
  rootFolder,
  moviesBaseFolder,
  showsBaseFolder,
  namingPresets,
  activeNamingPresetId,
  save,
  deleteToken,
} = useSettings()
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
  moving,
  supportsMove,
  visibleRows,
  readyCount,
  chooseAndScan,
  selectMatch,
  updateTarget,
  setEnabled,
  resetPlanForSettingsChange,
  moveAll,
} = useMediaPlan(token, {
  root: rootFolder,
  movies: moviesBaseFolder,
  shows: showsBaseFolder,
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
  moviesBaseFolder: string
  showsBaseFolder: string
  namingPresets: typeof namingPresets.value
  activeNamingPresetId: string
}): void {
  save(settings)
  resetPlanForSettingsChange()
  page.value = 'renamer'
}
</script>

<template>
  <main v-if="page === 'renamer'">
    <header class="hero">
      <div>
        <p class="eyebrow">SIMPLE LOCAL MEDIA ORGANIZER</p>
        <div class="app-name">
          <h1>ReelTidy</h1>
          <button
            class="info-button"
            type="button"
            aria-label="About ReelTidy"
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
      @move="moveAll"
    />

    <p v-if="!supportsMove" class="notice danger">
      Native moving is not available in this browser. Execution remains disabled; there is no copy
      fallback.
    </p>
    <p v-if="scanState" class="notice">{{ scanState }}</p>
    <p v-if="moveState" class="notice">{{ moveState }}</p>

    <PlanTable
      v-if="rows.length"
      :rows="visibleRows"
      :filter="filter"
      :has-token="Boolean(token)"
      @update:filter="filter = $event"
      @select-match="selectMatch"
      @update-target="updateTarget"
      @set-enabled="setEnabled"
    />
    <ExecutionLog v-if="logs.length" :entries="logs" />
  </main>
  <main v-else>
    <SettingsPage
      :token="token"
      :root-folder="rootFolder"
      :movies-base-folder="moviesBaseFolder"
      :shows-base-folder="showsBaseFolder"
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
