<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AboutDialog from './components/AboutDialog.vue'
import BrowserSupportDialog from './components/BrowserSupportDialog.vue'
import ExecutionLog from './components/ExecutionLog.vue'
import PlanTable from './components/PlanTable.vue'
import SettingsPage from './components/SettingsPage.vue'
import WorkflowSteps from './components/WorkflowSteps.vue'
import { vStickyHeight } from './directives/stickyHeight'
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
const workspace = ref<HTMLElement>()
const brand = ref<HTMLElement>()
const settingsButton = ref<HTMLElement>()
const dockReady = ref(false)
const dockComplete = ref(false)
let brandShift = { x: 0, y: 0 }
let settingsShift = { x: 0, y: 0 }
const apiCheckComplete = ref(false)
const fileSystemApiAvailable = ref(false)
const isFirefox = ref(false)
const showBrowserSupportDialog = computed(
  () => apiCheckComplete.value && !fileSystemApiAvailable.value,
)
function updateDockProgress(): void {
  if (!dockReady.value || !workspace.value) return
  const progress = Math.min(1, Math.max(0, window.scrollY / 240))
  const lateralProgress = Math.min(1, Math.max(0, window.scrollY / 90))
  const vertical = progress * progress * (3 - 2 * progress)
  const lateral = lateralProgress * lateralProgress * (3 - 2 * lateralProgress)
  const style = workspace.value.style
  style.setProperty('--brand-tx', `${brandShift.x * lateral}px`)
  style.setProperty('--brand-ty', `${brandShift.y * vertical}px`)
  style.setProperty('--brand-rotation', `${-90 * lateral}deg`)
  style.setProperty('--brand-scale', String(1 - 0.5 * lateral))
  style.setProperty('--settings-tx', `${settingsShift.x * lateral}px`)
  style.setProperty('--settings-ty', `${settingsShift.y * vertical}px`)
  style.setProperty('--settings-rotation', `${90 * lateral}deg`)
  style.setProperty('--settings-scale', String(1 - 0.15 * lateral))
  style.setProperty('--dock-detail-opacity', String(1 - lateral))
  dockComplete.value = lateralProgress >= 1
}

async function measureDock(): Promise<void> {
  dockReady.value = false
  dockComplete.value = false
  await nextTick()
  if (!workspace.value || !brand.value || !settingsButton.value) return
  if (!window.matchMedia('(min-width: 1100px)').matches) return

  const brandRect = brand.value.getBoundingClientRect()
  const settingsRect = settingsButton.value.getBoundingClientRect()
  const initialTop = window.scrollY
  const style = workspace.value.style
  style.setProperty('--brand-x', `${brandRect.left}px`)
  style.setProperty('--brand-y', `${brandRect.top + initialTop}px`)
  style.setProperty('--settings-x', `${settingsRect.left}px`)
  style.setProperty('--settings-y', `${settingsRect.top + initialTop}px`)
  brandShift = {
    x: 24 - (brandRect.left + brandRect.width / 2),
    y: window.innerHeight / 2 - (brandRect.top + initialTop + brandRect.height / 2),
  }
  settingsShift = {
    x: window.innerWidth - 24 - (settingsRect.left + settingsRect.width / 2),
    y: window.innerHeight / 2 - (settingsRect.top + initialTop + settingsRect.height / 2),
  }
  dockReady.value = true
  await nextTick()
  updateDockProgress()
}

onMounted(() => {
  fileSystemApiAvailable.value = 'showDirectoryPicker' in window && window.isSecureContext
  isFirefox.value = /firefox/i.test(navigator.userAgent)
  apiCheckComplete.value = true
  window.addEventListener('scroll', updateDockProgress, { passive: true })
  window.addEventListener('resize', measureDock, { passive: true })
  void measureDock()
})
onUnmounted(() => {
  window.removeEventListener('scroll', updateDockProgress)
  window.removeEventListener('resize', measureDock)
})
watch(page, (value) => {
  if (value === 'renamer') void measureDock()
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
  <main
    v-if="page === 'renamer'"
    ref="workspace"
    class="renamer-page"
    :class="{ 'dock-ready': dockReady, 'dock-complete': dockComplete }"
  >
    <header class="hero">
      <div ref="brand" class="brand">
        <p class="eyebrow">SIMPLE LOCAL MEDIA ORGANIZER</p>
        <div class="app-name">
          <h1>ReelyTidy</h1>
          <button
            class="info-button"
            type="button"
            aria-label="About ReelyTidy"
            :aria-hidden="dockComplete"
            :tabindex="dockComplete ? -1 : 0"
            @click="aboutOpen = true"
          >
            i
          </button>
        </div>
      </div>
      <button ref="settingsButton" class="settings" @click="page = 'settings'">
        ⚙ Settings <span :class="{ active: token }"></span>
      </button>
    </header>

    <div v-sticky-height="'--workflow-stack-height'" class="workflow-sticky">
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
    </div>

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
