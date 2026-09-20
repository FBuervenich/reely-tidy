<script setup lang="ts">
import ExecutionLog from './components/ExecutionLog.vue'
import PlanTable from './components/PlanTable.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import WorkflowSteps from './components/WorkflowSteps.vue'
import { useMediaPlan } from './composables/useMediaPlan'
import { useSettings } from './composables/useSettings'

const { token, dialogOpen, saveToken, deleteToken } = useSettings()
const {
  root, rootName, rows, logs, filter, scanState, moveState, scanning, moving, supportsMove,
  visibleRows, readyCount, chooseFolder, scan, selectMatch, updateTarget, setEnabled, moveAll
} = useMediaPlan(token)
</script>

<template>
  <main>
    <header class="hero">
      <div><p class="eyebrow">LOCAL · JELLYFIN · OHNE SERVER</p><h1>Media Renamer</h1><p class="sub">Ordnet Filme und Serien neu — mit deinem Browser direkt auf dem gewählten Datenträger.</p></div>
      <button class="settings" @click="dialogOpen = true">⚙ TMDB-Zugang <span :class="{ active: token }"></span></button>
    </header>

    <WorkflowSteps
      :root-name="rootName"
      :has-root="Boolean(root)"
      :scanning="scanning"
      :moving="moving"
      :ready-count="readyCount"
      :supports-move="supportsMove"
      @choose-folder="chooseFolder"
      @scan="scan"
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
    <SettingsDialog v-model:open="dialogOpen" :token="token" @save="saveToken" @delete="deleteToken" />
  </main>
</template>
