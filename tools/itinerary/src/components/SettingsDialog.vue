<script setup lang="ts">
import { computed, ref } from "vue";
import { MODELS } from "../lib/schema";
import { useSettingsStore } from "../stores/settings";
import ModalShell from "./ModalShell.vue";

const emit = defineEmits<{ close: [] }>();

const settings = useSettingsStore();

const keyDraft = ref(settings.apiKey);
const modelDraft = ref(settings.model);
const menuOpen = ref(false);

const chosen = computed(() => MODELS.find((m) => m.id === modelDraft.value));

function save() {
  settings.saveSmartAdd(keyDraft.value, modelDraft.value);
  emit("close");
}

function clearKey() {
  settings.clearApiKey();
  keyDraft.value = "";
  emit("close");
}
</script>

<template>
  <ModalShell title="Settings" @close="emit('close')">
    <div class="modal-body">
      <div class="section">Smart Add</div>
      <p class="prose">
        Smart Add sends pasted text to OpenRouter and turns it into proposed changes you review
        before anything is applied. The key is stored in this browser only — it never goes into
        the shareable link.
      </p>

      <div>
        <div class="field-label head">OpenRouter API key</div>
        <div class="key-row">
          <input
            v-model="keyDraft"
            type="password"
            class="text-input"
            placeholder="sk-or-v1-…"
          />
          <button v-if="settings.apiKey" class="btn is-danger" @click="clearKey">Remove</button>
        </div>
      </div>

      <div>
        <div class="field-label head">Model</div>
        <div class="model">
          <button class="model-btn" @click="menuOpen = !menuOpen">
            <span class="model-name">{{ settings.labelFor(modelDraft) }}</span>
            <span v-if="chosen?.suggested" class="suggested">Suggested</span>
            <span class="caret">▾</span>
          </button>

          <div v-if="menuOpen" class="menu model-menu">
            <button
              v-for="model in MODELS"
              :key="model.id"
              class="menu-item model-item"
              :class="{ 'is-chosen': model.id === modelDraft }"
              @click="
                modelDraft = model.id;
                menuOpen = false;
              "
            >
              <span class="model-copy">
                <span class="model-label">{{ model.label }}</span>
                <span class="model-note">{{ model.note }}</span>
              </span>
              <span v-if="model.suggested" class="suggested trailing">Suggested</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('close')">Cancel</button>
      <button class="btn is-primary" @click="save">Save</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.section {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.prose {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.head {
  margin-bottom: 4px;
}

.key-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.key-row .text-input {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 8px;
  padding: 8px 10px;
}

.model {
  position: relative;
}

.model-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
}

.model-btn:hover {
  border-color: var(--accent);
}

.model-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}

.suggested {
  font-size: 10px;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  border-radius: 99px;
  padding: 1px 7px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.trailing {
  margin-left: auto;
}

.model-menu {
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  background: var(--card);
}

.model-item:hover {
  background: var(--bg);
}

.model-item.is-chosen {
  background: color-mix(in oklab, var(--accent) 10%, transparent);
  color: var(--accent);
}

.model-copy {
  min-width: 0;
}

.model-label {
  display: block;
}

.model-note {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 1px;
}
</style>
