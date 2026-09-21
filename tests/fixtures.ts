import { ref } from 'vue'
import { useMediaPlan } from '../src/composables/useMediaPlan'
import { defaultNamingPreset } from '../src/lib/naming'
import { createPlan } from '../src/services/plan-builder'
import type { FoundFile } from '../src/types/plan'

export function file(path: string, content = ''): FoundFile {
  return {
    path,
    name: path.split('/').at(-1)!,
    parent: {} as FileSystemDirectoryHandle,
    handle: {
      getFile: async () => ({ size: content.length, text: async () => content }),
    } as FileSystemFileHandle,
  }
}
export function setupPlan(paths: string[]) {
  const plan = useMediaPlan(ref('token'), {
    root: ref('_clean'),
    preset: ref(defaultNamingPreset()),
  })
  plan.rows.value = createPlan(
    paths.map((path) => file(path)),
    { root: '_clean' },
  )
  return plan
}
export const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status })
