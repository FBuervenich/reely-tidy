<script setup lang="ts">
defineProps<{
  rootName: string
  hasRoot: boolean
  scanning: boolean
  moving: boolean
  readyCount: number
  supportsMove: boolean
  onChooseFolder: () => Promise<void>
}>()
defineEmits<{ scan: []; move: [] }>()
</script>

<template>
  <section class="workflow">
    <div class="step"><span>1</span><div><b>Ordner wählen</b><small>{{ rootName }}</small></div><button type="button" @click="onChooseFolder">Ordner auswählen</button></div>
    <div class="step"><span>2</span><div><b>Vorschau erzeugen</b><small>Videos und gleichnamige Begleitdateien</small></div><button :disabled="!hasRoot || scanning" @click="$emit('scan')">{{ scanning ? 'Scanne …' : 'Scannen' }}</button></div>
    <div class="step"><span>3</span><div><b>Änderungen ausführen</b><small>{{ readyCount }} bereit</small></div><button class="accent" :disabled="!readyCount || moving || !supportsMove" @click="$emit('move')">{{ moving ? 'Verschiebe …' : 'Jetzt verschieben' }}</button></div>
  </section>
</template>
