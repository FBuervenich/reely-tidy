<script setup lang="ts">
defineProps<{ open: boolean; isFirefox: boolean }>()
</script>

<template>
  <dialog class="browser-support-dialog" :open="open">
    <div>
      <p class="eyebrow">BROWSER COMPATIBILITY</p>
      <h2>A Chromium browser is required</h2>
      <p v-if="isFirefox">Firefox is a great browser, but it does not currently support the File System Access API required by ReelTidy.</p>
      <p v-else>This browser does not currently support the File System Access API required by ReelTidy.</p>
      <p>Please open ReelTidy in a current Chromium-based browser, such as <b>Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi, Arc, Helium,</b> or <b>Chromium</b>.</p>
    </div>
  </dialog>
</template>
