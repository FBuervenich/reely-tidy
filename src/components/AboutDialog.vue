<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

watch(
  () => props.open,
  (open) => {
    if (!dialog.value) return
    if (open && !dialog.value.open) dialog.value.showModal()
    if (!open && dialog.value.open) dialog.value.close()
  },
)
</script>

<template>
  <dialog ref="dialog" class="about-dialog" @close="emit('close')">
    <button class="close" type="button" aria-label="Close information" @click="emit('close')">
      ×
    </button>
    <p class="eyebrow">ABOUT REELYTIDY</p>
    <h2>Private by design</h2>
    <ul class="about-list">
      <li><b>Everything stays local.</b> Your media files never leave your device.</li>
      <li>
        <b>TMDB is called directly.</b> Metadata lookups happen from your browser to TMDB; there is
        no ReelyTidy server in between.
      </li>
      <li><b>No tracking.</b> ReelyTidy does not include analytics or tracking services.</li>
    </ul>
    <h3>How it works</h3>
    <ol class="about-list">
      <li>Choose a folder.</li>
      <li>ReelyTidy automatically identifies movies and shows.</li>
      <li>Review the migration plan, then move files into a clean folder structure.</li>
      <li>
        Original folders remain because of browser limitations. You can remove them manually
        afterwards if desired.
      </li>
    </ol>
  </dialog>
</template>
