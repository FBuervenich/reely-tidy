<script setup lang="ts">
defineProps<{
  rootName: string
  scanning: boolean
  moving: boolean
  readyCount: number
  supportsMove: boolean
  fileSystemApiAvailable: boolean
  onChooseAndScan: () => Promise<void>
}>()
defineEmits<{ move: [] }>()
</script>

<template>
  <section class="workflow">
    <div class="step">
      <span>1</span>
      <div>
        <b>Choose folder &amp; scan</b
        ><small>{{
          rootName === 'No folder selected' ? 'Videos and matching sidecar files' : rootName
        }}</small>
      </div>
      <div class="step-actions">
        <button
          type="button"
          :disabled="scanning || !fileSystemApiAvailable"
          @click="onChooseAndScan"
        >
          {{ scanning ? 'Scanning …' : 'Choose folder and scan' }}</button
        ><small class="dry-run-hint">Loads a preview only — no files are changed.</small>
      </div>
    </div>
    <div class="step">
      <span>2</span>
      <div>
        <b>Apply changes</b><small>{{ readyCount }} ready</small>
      </div>
      <button
        class="accent"
        :disabled="!readyCount || moving || !supportsMove"
        @click="$emit('move')"
      >
        {{ moving ? 'Moving …' : 'Move now' }}
      </button>
    </div>
  </section>
</template>
