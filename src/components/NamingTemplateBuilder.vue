<script setup lang="ts">
import {
  TOKEN_LABELS,
  type NamingTemplate,
  type TemplatePiece,
  type TemplateToken,
} from '../lib/naming'

const props = defineProps<{
  title: string
  template: NamingTemplate
  allowedTokens: TemplateToken[]
  preview: string
}>()
const emit = defineEmits<{ 'update:template': [template: NamingTemplate] }>()

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
function copy(): NamingTemplate {
  return JSON.parse(JSON.stringify(props.template)) as NamingTemplate
}
function update(template: NamingTemplate): void {
  emit('update:template', template)
}
function addFolder(): void {
  const template = copy()
  template.folders.push([])
  update(template)
}
function removeFolder(index: number): void {
  const template = copy()
  template.folders.splice(index, 1)
  update(template)
}
function moveFolder(index: number, offset: -1 | 1): void {
  const destination = index + offset
  if (destination < 0 || destination >= props.template.folders.length) return
  const template = copy()
  const [folder] = template.folders.splice(index, 1)
  template.folders.splice(destination, 0, folder)
  update(template)
}
function addPiece(area: 'folder' | 'filename', token?: TemplateToken, folderIndex?: number): void {
  const template = copy()
  const piece: TemplatePiece = token
    ? { id: newId(), type: 'token', token }
    : { id: newId(), type: 'text', value: ' ' }
  if (area === 'filename') template.filename.push(piece)
  else template.folders[folderIndex!].push(piece)
  update(template)
}
function addSelectedPiece(area: 'folder' | 'filename', event: Event, folderIndex?: number): void {
  const select = event.target as HTMLSelectElement
  const token = select.value as TemplateToken
  if (!token) return
  select.value = ''
  addPiece(area, token, folderIndex)
}
function removePiece(area: 'folder' | 'filename', index: number, folderIndex?: number): void {
  const template = copy()
  if (area === 'filename') template.filename.splice(index, 1)
  else template.folders[folderIndex!].splice(index, 1)
  update(template)
}
function updateText(
  area: 'folder' | 'filename',
  index: number,
  value: string,
  folderIndex?: number,
): void {
  const template = copy()
  const piece =
    area === 'filename' ? template.filename[index] : template.folders[folderIndex!][index]
  piece.value = value
  update(template)
}
</script>

<template>
  <section class="template-builder">
    <h3>{{ title }}</h3>
    <div class="template-area">
      <div class="template-area-head">
        <b>Subfolders</b
        ><button type="button" class="small-button" @click="addFolder">+ Add folder</button>
      </div>
      <p v-if="!template.folders.length" class="template-empty">
        No extra folders — files go directly into the base folder.
      </p>
      <div
        v-for="(folder, folderIndex) in template.folders"
        :key="folderIndex"
        class="template-row"
      >
        <span class="template-row-label">Folder {{ folderIndex + 1 }}</span>
        <div class="piece-list">
          <template v-for="(piece, pieceIndex) in folder" :key="piece.id">
            <span v-if="piece.type === 'token'" class="template-piece token"
              >{{ TOKEN_LABELS[piece.token!]
              }}<button
                type="button"
                aria-label="Remove building block"
                @click="removePiece('folder', pieceIndex, folderIndex)"
              >
                ×
              </button></span
            >
            <span v-else class="template-piece text"
              ><input
                :value="piece.value"
                aria-label="Fixed text"
                @input="
                  updateText(
                    'folder',
                    pieceIndex,
                    ($event.target as HTMLInputElement).value,
                    folderIndex,
                  )
                "
              /><button
                type="button"
                aria-label="Remove text"
                @click="removePiece('folder', pieceIndex, folderIndex)"
              >
                ×
              </button></span
            >
          </template>
          <select
            aria-label="Add building block"
            @change="addSelectedPiece('folder', $event, folderIndex)"
          >
            <option value="" selected disabled>Add block …</option>
            <option v-for="token in allowedTokens" :key="token" :value="token">
              {{ TOKEN_LABELS[token] }}
            </option>
          </select>
          <button
            type="button"
            class="small-button"
            @click="addPiece('folder', undefined, folderIndex)"
          >
            + Text
          </button>
        </div>
        <div class="folder-actions">
          <button
            type="button"
            class="move-folder"
            aria-label="Move folder up"
            title="Move folder up"
            :disabled="folderIndex === 0"
            @click="moveFolder(folderIndex, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="move-folder"
            aria-label="Move folder down"
            title="Move folder down"
            :disabled="folderIndex === template.folders.length - 1"
            @click="moveFolder(folderIndex, 1)"
          >
            ↓
          </button>
          <button type="button" class="remove-folder" @click="removeFolder(folderIndex)">
            Remove folder
          </button>
        </div>
      </div>
    </div>
    <div class="template-area">
      <div class="template-area-head">
        <b>Filename <small>(extension is retained automatically)</small></b>
      </div>
      <div class="template-row filename-row">
        <div class="piece-list">
          <template v-for="(piece, pieceIndex) in template.filename" :key="piece.id">
            <span v-if="piece.type === 'token'" class="template-piece token"
              >{{ TOKEN_LABELS[piece.token!]
              }}<button
                type="button"
                aria-label="Remove building block"
                @click="removePiece('filename', pieceIndex)"
              >
                ×
              </button></span
            >
            <span v-else class="template-piece text"
              ><input
                :value="piece.value"
                aria-label="Fixed text"
                @input="
                  updateText('filename', pieceIndex, ($event.target as HTMLInputElement).value)
                "
              /><button
                type="button"
                aria-label="Remove text"
                @click="removePiece('filename', pieceIndex)"
              >
                ×
              </button></span
            >
          </template>
          <select aria-label="Add building block" @change="addSelectedPiece('filename', $event)">
            <option value="" selected disabled>Add block …</option>
            <option v-for="token in allowedTokens" :key="token" :value="token">
              {{ TOKEN_LABELS[token] }}
            </option>
          </select>
          <button type="button" class="small-button" @click="addPiece('filename')">+ Text</button>
        </div>
      </div>
    </div>
    <p class="path-preview template-preview">
      Preview: <code>{{ preview }}</code>
    </p>
  </section>
</template>
