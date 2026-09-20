<script setup lang="ts">
import { ref } from 'vue'
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
}>()
const emit = defineEmits<{ 'update:template': [template: NamingTemplate] }>()
const folderTokens = ref<Record<number, TemplateToken>>({})
const filenameToken = ref<TemplateToken>(props.allowedTokens[0])

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
function addPiece(area: 'folder' | 'filename', token?: TemplateToken, folderIndex?: number): void {
  const template = copy()
  const piece: TemplatePiece = token
    ? { id: newId(), type: 'token', token }
    : { id: newId(), type: 'text', value: ' ' }
  if (area === 'filename') template.filename.push(piece)
  else template.folders[folderIndex!].push(piece)
  update(template)
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
          <select v-model="folderTokens[folderIndex]" aria-label="Building block">
            <option v-for="token in allowedTokens" :key="token" :value="token">
              {{ TOKEN_LABELS[token] }}
            </option>
          </select>
          <button
            type="button"
            class="small-button"
            @click="addPiece('folder', folderTokens[folderIndex] || allowedTokens[0], folderIndex)"
          >
            Add block
          </button>
          <button
            type="button"
            class="small-button"
            @click="addPiece('folder', undefined, folderIndex)"
          >
            + Text
          </button>
        </div>
        <button type="button" class="remove-folder" @click="removeFolder(folderIndex)">
          Remove folder
        </button>
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
          <select v-model="filenameToken" aria-label="Building block">
            <option v-for="token in allowedTokens" :key="token" :value="token">
              {{ TOKEN_LABELS[token] }}
            </option>
          </select>
          <button type="button" class="small-button" @click="addPiece('filename', filenameToken)">
            Add block
          </button>
          <button type="button" class="small-button" @click="addPiece('filename')">+ Text</button>
        </div>
      </div>
    </div>
  </section>
</template>
