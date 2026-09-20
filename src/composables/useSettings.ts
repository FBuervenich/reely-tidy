import { ref } from 'vue'
import { readSettings, writeSettings, type AppSettings } from '../services/storage'

export function useSettings() {
  const stored = readSettings()
  const token = ref(stored.token)
  const rootFolder = ref(stored.rootFolder)
  const moviesBaseFolder = ref(stored.moviesBaseFolder)
  const showsBaseFolder = ref(stored.showsBaseFolder)

  function save(settings: AppSettings): void {
    token.value = settings.token.trim()
    rootFolder.value = settings.rootFolder.trim() || '_clean'
    moviesBaseFolder.value = settings.moviesBaseFolder.trim() || 'Movies'
    showsBaseFolder.value = settings.showsBaseFolder.trim() || 'Shows'
    writeSettings({ token: token.value, rootFolder: rootFolder.value, moviesBaseFolder: moviesBaseFolder.value, showsBaseFolder: showsBaseFolder.value })
  }
  function deleteToken(): void {
    save({ token: '', rootFolder: rootFolder.value, moviesBaseFolder: moviesBaseFolder.value, showsBaseFolder: showsBaseFolder.value })
  }

  return { token, rootFolder, moviesBaseFolder, showsBaseFolder, save, deleteToken }
}
