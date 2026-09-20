<script setup lang="ts">
import { ref } from 'vue'
import ExecutionLog from './components/ExecutionLog.vue'
import PlanTable from './components/PlanTable.vue'
import SettingsPage from './components/SettingsPage.vue'
import WorkflowSteps from './components/WorkflowSteps.vue'
import { useMediaPlan } from './composables/useMediaPlan'
import { useSettings } from './composables/useSettings'

const { token, rootFolder, moviesBaseFolder, showsBaseFolder, save, deleteToken } = useSettings()
const {
  root, rootName, rows, logs, filter, scanState, moveState, scanning, moving, supportsMove,
  visibleRows, readyCount, chooseFolder, scan, selectMatch, updateTarget, setEnabled, resetPlanForSettingsChange, releaseAccess, moveAll
} = useMediaPlan(token, { root: rootFolder, movies: moviesBaseFolder, shows: showsBaseFolder })
const page = ref<'renamer' | 'settings'>('renamer')

function saveSettings(settings: { token: string; rootFolder: string; moviesBaseFolder: string; showsBaseFolder: string }): void {
  save(settings)
  resetPlanForSettingsChange()
  page.value = 'renamer'
}
</script>

<template>
  <main v-if="page === 'renamer'">
    <header class="hero">
      <div><p class="eyebrow">LOCAL · JELLYFIN · OHNE SERVER</p><h1>Media Renamer</h1><p class="sub">Ordnet Filme und Serien neu — mit deinem Browser direkt auf dem gewählten Datenträger.</p></div>
      <button class="settings" @click="page = 'settings'">⚙ Einstellungen <span :class="{ active: token }"></span></button>
    </header>

    <WorkflowSteps
      :root-name="rootName"
      :has-root="Boolean(root)"
      :scanning="scanning"
      :moving="moving"
      :ready-count="readyCount"
      :supports-move="supportsMove"
      :can-release="Boolean(root)"
      :on-choose-folder="chooseFolder"
      @scan="scan"
      @release="releaseAccess()"
      @move="moveAll"
    />

    <p v-if="!supportsMove" class="notice danger">Echtes Verschieben wird von diesem Browser nicht angeboten. Die Ausführung bleibt gesperrt; es gibt keinen Kopier-Fallback.</p>
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
  <main v-else><SettingsPage :token="token" :root-folder="rootFolder" :movies-base-folder="moviesBaseFolder" :shows-base-folder="showsBaseFolder" @save="saveSettings" @delete-token="deleteToken" @back="page = 'renamer'" /></main>
</template>
