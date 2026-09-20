import type { FoundFile } from '../types/plan'

export function supportsNativeMove(): boolean {
  return typeof FileSystemFileHandle !== 'undefined'
    && typeof (FileSystemFileHandle.prototype as FileSystemFileHandle).move === 'function'
}

export async function pickSourceFolder(): Promise<FileSystemDirectoryHandle> {
  if (!window.isSecureContext) {
    throw new Error('Ordnerzugriff ist nur über einen sicheren lokalen Ursprung möglich. Öffne die App über http://localhost, nicht über eine LAN-IP oder file://.')
  }
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Dieser Browser unterstützt die File System Access API nicht. Bitte aktuelles Chromium oder Chrome verwenden.')
  }

  const folder = await window.showDirectoryPicker({ mode: 'readwrite' })
  const permission = await folder.requestPermission({ mode: 'readwrite' })
  if (permission !== 'granted') {
    throw new Error('Schreibzugriff wurde nicht erteilt. Bitte den Ordner erneut auswählen und den Schreibzugriff im Browser erlauben.')
  }
  return folder
}

export async function listFiles(folder: FileSystemDirectoryHandle, prefix = ''): Promise<FoundFile[]> {
  const files: FoundFile[] = []
  for await (const [, entry] of folder.entries()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'directory') files.push(...await listFiles(entry as FileSystemDirectoryHandle, path))
    else files.push({ name: entry.name, path, handle: entry as FileSystemFileHandle, parent: folder })
  }
  return files
}

export async function getDestination(root: FileSystemDirectoryHandle, target: string): Promise<{ folder: FileSystemDirectoryHandle; name: string }> {
  const parts = target.split('/')
  const name = parts.pop()
  if (!name) throw new Error('Ungültiger Zielpfad.')
  let folder = root
  for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true })
  return { folder, name }
}

export async function fileExists(folder: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try { await folder.getFileHandle(name); return true }
  catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return false
    throw error
  }
}

export async function moveFile(handle: FileSystemFileHandle, folder: FileSystemDirectoryHandle, name: string): Promise<void> {
  const move = (handle as FileSystemHandle).move
  if (!move) throw new Error('Echtes Verschieben wird von diesem Chromium nicht unterstützt.')
  await move.call(handle, folder, name)
}
