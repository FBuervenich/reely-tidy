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
    <div class="step" :class="{ 'has-selected-folder': rootName !== 'No folder selected' }">
      <span>1</span>
      <div>
        <b>Choose folder &amp; scan</b
        ><small :class="{ 'selected-folder': rootName !== 'No folder selected' }">
          {{
            rootName === 'No folder selected'
              ? 'Videos and matching sidecar files'
              : `Selected folder: ${rootName}`
          }}
        </small>
      </div>
      <div class="step-actions">
        <button
          type="button"
          :disabled="scanning || !fileSystemApiAvailable"
          @click="onChooseAndScan"
        >
          {{
            scanning
              ? 'Scanning …'
              : rootName === 'No folder selected'
                ? 'Choose folder & scan'
                : 'Choose a different folder & scan'
          }}</button
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
        :disabled="!readyCount || moving || scanning || !supportsMove"
        @click="$emit('move')"
      >
        {{ moving ? 'Moving …' : scanning ? 'Preparing …' : 'Move now' }}
      </button>
    </div>
  </section>
</template>
