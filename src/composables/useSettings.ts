import { ref } from 'vue'
import { readTmdbToken, writeTmdbToken } from '../services/storage'

export function useSettings() {
  const token = ref(readTmdbToken())
  const dialogOpen = ref(false)

  function saveToken(value: string): void {
    token.value = value.trim()
    writeTmdbToken(token.value)
    dialogOpen.value = false
  }
  function deleteToken(): void { token.value = ''; writeTmdbToken('') }

  return { token, dialogOpen, saveToken, deleteToken }
}
