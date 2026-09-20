import { ref } from 'vue'
import { readSettings, writeSettings, type AppSettings } from '../services/storage'

export function useSettings() {
  const stored = readSettings()
  const token = ref(stored.token)
  const rootFolder = ref(stored.rootFolder)
  const moviesBaseFolder = ref(stored.moviesBaseFolder)
  const showsBaseFolder = ref(stored.showsBaseFolder)
  const namingPresets = ref(stored.namingPresets)
  const activeNamingPresetId = ref(stored.activeNamingPresetId)

  function save(settings: AppSettings): void {
    token.value = settings.token.trim()
    rootFolder.value = settings.rootFolder.trim() || '_clean'
    moviesBaseFolder.value = settings.moviesBaseFolder.trim() || 'Movies'
    showsBaseFolder.value = settings.showsBaseFolder.trim() || 'Shows'
    namingPresets.value = settings.namingPresets
    activeNamingPresetId.value = settings.activeNamingPresetId
    writeSettings({
      token: token.value,
      rootFolder: rootFolder.value,
      moviesBaseFolder: moviesBaseFolder.value,
      showsBaseFolder: showsBaseFolder.value,
      namingPresets: namingPresets.value,
      activeNamingPresetId: activeNamingPresetId.value,
    })
  }
  function deleteToken(): void {
    save({
      token: '',
      rootFolder: rootFolder.value,
      moviesBaseFolder: moviesBaseFolder.value,
      showsBaseFolder: showsBaseFolder.value,
      namingPresets: namingPresets.value,
      activeNamingPresetId: activeNamingPresetId.value,
    })
  }

  return {
    token,
    rootFolder,
    moviesBaseFolder,
    showsBaseFolder,
    namingPresets,
    activeNamingPresetId,
    save,
    deleteToken,
  }
}
