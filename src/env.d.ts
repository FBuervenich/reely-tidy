/// <reference types="vite/client" />

interface FileSystemHandle {
  move?: (destination: FileSystemDirectoryHandle, newName?: string) => Promise<void>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}
