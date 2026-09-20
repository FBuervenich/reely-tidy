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
    <div class="page-heading"><div><p class="eyebrow">SETTINGS</p><h1>Configuration</h1><p class="sub">All values are stored in this browser only.</p></div><button @click="$emit('back')">← Back to ReelTidy</button></div>
    <form class="settings-form" @submit.prevent="save">
      <fieldset><legend>Folder structure</legend><p>All destination folders are created inside the selected source folder.</p><label>Root destination folder<input v-model="rootDraft" required placeholder="_clean" /></label><label>Movies base folder<input v-model="moviesDraft" required placeholder="Movies" /></label><label>Shows base folder<input v-model="showsDraft" required placeholder="Shows" /></label><p class="path-preview">Movie destination: <code>{{ previewRoot() }}/{{ previewMovies() }}/Movie (2024)/Movie (2024).mkv</code></p></fieldset>
      <fieldset><legend>TMDB access</legend><p>Your personal Read Access Token is stored locally and sent directly to TMDB only — never to an application server.</p><label>TMDB API Read Access Token<input v-model="tokenDraft" type="password" autocomplete="off" placeholder="eyJhbGciOiJIUzI1NiJ9…" /></label><button type="button" class="quiet" @click="clearToken">Delete token</button></fieldset>
      <div class="settings-actions"><button type="button" class="quiet" @click="$emit('back')">Cancel</button><button class="accent" type="submit">Save settings</button></div>
    </form>
  </section>
</template>
