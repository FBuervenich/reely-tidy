<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AppSettings } from '../services/storage'

const props = defineProps<{ token: string; rootFolder: string; moviesBaseFolder: string; showsBaseFolder: string }>()
const emit = defineEmits<{ save: [settings: AppSettings]; deleteToken: []; back: [] }>()
const tokenDraft = ref(props.token)
const rootDraft = ref(props.rootFolder)
const moviesDraft = ref(props.moviesBaseFolder)
const showsDraft = ref(props.showsBaseFolder)
const previewRoot = () => rootDraft.value.trim() || '_clean'
const previewMovies = () => moviesDraft.value.trim() || 'Movies'

watch(() => [props.token, props.rootFolder, props.moviesBaseFolder, props.showsBaseFolder], ([token, root, movies, shows]) => {
  tokenDraft.value = token
  rootDraft.value = root
  moviesDraft.value = movies
  showsDraft.value = shows
})
function save(): void { emit('save', { token: tokenDraft.value, rootFolder: rootDraft.value, moviesBaseFolder: moviesDraft.value, showsBaseFolder: showsDraft.value }) }
function clearToken(): void { tokenDraft.value = ''; emit('deleteToken') }
</script>

<template>
  <section class="settings-page">
    <div class="page-heading"><div><p class="eyebrow">EINSTELLUNGEN</p><h1>Konfiguration</h1><p class="sub">Alle Werte bleiben ausschließlich in diesem Browser gespeichert.</p></div><button @click="$emit('back')">← Zum Renamer</button></div>
    <form class="settings-form" @submit.prevent="save">
      <fieldset><legend>Ordnerstruktur</legend><p>Alle Zielordner liegen im gewählten Quellordner.</p><label>Übergeordneter Zielordner<input v-model="rootDraft" required placeholder="_clean" /></label><label>Basis-Ordner für Filme<input v-model="moviesDraft" required placeholder="Movies" /></label><label>Basis-Ordner für Serien<input v-model="showsDraft" required placeholder="Shows" /></label><p class="path-preview">Film-Zielpfad: <code>{{ previewRoot() }}/{{ previewMovies() }}/Film (2024)/Film (2024).mkv</code></p></fieldset>
      <fieldset><legend>TMDB-Zugang</legend><p>Der persönliche Read Access Token wird nur lokal gespeichert und direkt an TMDB gesendet — nie an einen eigenen Server.</p><label>TMDB API Read Access Token<input v-model="tokenDraft" type="password" autocomplete="off" placeholder="eyJhbGciOiJIUzI1NiJ9…" /></label><button type="button" class="quiet" @click="clearToken">Token löschen</button></fieldset>
      <div class="settings-actions"><button type="button" class="quiet" @click="$emit('back')">Abbrechen</button><button class="accent" type="submit">Einstellungen speichern</button></div>
    </form>
  </section>
</template>
