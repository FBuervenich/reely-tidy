import type { FoundFile } from '../types/plan'
import { isAppleDoubleFile } from '../lib/media'

export function supportsNativeMove(): boolean {
  return (
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof (FileSystemFileHandle.prototype as FileSystemFileHandle).move === 'function'
  )
}

export async function pickSourceFolder(): Promise<FileSystemDirectoryHandle> {
  if (!window.isSecureContext) {
    throw new Error(
      'Folder access requires a secure local origin. Open the app via http://localhost, not a LAN IP or file://.',
    )
  }
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'This browser does not support the File System Access API. Please use a current version of Chromium or Chrome.',
    )
  }

  // This call must happen synchronously from the native click handler. The picker itself
  // requests write permission while that user activation is still active.
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

export interface ListFilesOptions {
  ignoredRootDirectories?: string[]
}

export async function listFiles(
  folder: FileSystemDirectoryHandle,
  options: ListFilesOptions = {},
  prefix = '',
): Promise<FoundFile[]> {
  const files: FoundFile[] = []
  const ignoredRootDirectories = new Set(
    (options.ignoredRootDirectories ?? [])
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean),
  )
  for await (const [, entry] of folder.entries()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    const ignoredAtRoot =
      !prefix &&
      entry.kind === 'directory' &&
      ignoredRootDirectories.has(entry.name.toLocaleLowerCase())
    if (entry.kind === 'directory') {
      if (!ignoredAtRoot)
        files.push(...(await listFiles(entry as FileSystemDirectoryHandle, options, path)))
    } else if (!isAppleDoubleFile(entry.name))
      files.push({ name: entry.name, path, handle: entry as FileSystemFileHandle, parent: folder })
  }
  return files
}

export async function getDestination(
  root: FileSystemDirectoryHandle,
  target: string,
): Promise<{ folder: FileSystemDirectoryHandle; name: string }> {
  const parts = target.split('/')
  const name = parts.pop()
  if (!name) throw new Error('Invalid destination path.')
  let folder = root
  for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true })
  return { folder, name }
}

export async function fileExists(
  folder: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await folder.getFileHandle(name)
    return true
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return false
    throw error
  }
}

export async function moveFile(
  handle: FileSystemFileHandle,
  folder: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  const move = (handle as FileSystemHandle).move
  if (!move) throw new Error('Native moving is not supported by this Chromium browser.')
  await move.call(handle, folder, name)
}
