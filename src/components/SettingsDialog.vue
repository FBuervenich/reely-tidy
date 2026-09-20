<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean; token: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; save: [token: string]; delete: [] }>()
const draft = ref(props.token)

watch(() => props.open, (open) => { if (open) draft.value = props.token })
function save(): void { emit('save', draft.value) }
function remove(): void { draft.value = ''; emit('delete') }
</script>

<template>
  <dialog :open="open"><form method="dialog" @submit.prevent="save">
    <button class="close" type="button" aria-label="Dialog schließen" @click="emit('update:open', false)">×</button>
    <p class="eyebrow">EINSTELLUNGEN</p><h2>TMDB-Zugang</h2>
    <p>Dein persönlicher TMDB API Read Access Token wird ausschließlich im lokalen Browser-Speicher abgelegt und direkt an TMDB gesendet — nie an einen eigenen Server.</p>
    <label>Read Access Token<input v-model="draft" type="password" autocomplete="off" placeholder="eyJhbGciOiJIUzI1NiJ9…" /></label>
    <div class="dialog-actions"><button type="button" class="quiet" @click="remove">Token löschen</button><button class="accent" type="submit">Lokal speichern</button></div>
  </form></dialog>
</template>
