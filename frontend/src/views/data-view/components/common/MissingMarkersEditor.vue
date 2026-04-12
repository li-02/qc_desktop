<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { Plus } from "lucide-vue-next";
import { useDatasetStore } from "@/stores/useDatasetStore";

const datasetStore = useDatasetStore();

const markers = computed(() => datasetStore.currentDatasetMissingMarkers);

// 编辑状态
const isEditing = ref(false);
const editMarkers = ref<string[]>([]);
const newMarkerInput = ref("");
const saving = ref(false);

const startEdit = () => {
  editMarkers.value = [...markers.value];
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
  editMarkers.value = [];
  newMarkerInput.value = "";
};

const removeMarker = (index: number) => {
  editMarkers.value.splice(index, 1);
};

const addMarker = () => {
  const val = newMarkerInput.value.trim();
  if (val === "") {
    // 允许添加空字符串标记
    if (!editMarkers.value.includes("")) {
      editMarkers.value.push("");
      newMarkerInput.value = "";
    } else {
      ElMessage.warning("该标记已存在");
    }
    return;
  }
  if (editMarkers.value.includes(val)) {
    ElMessage.warning("该标记已存在");
    return;
  }
  editMarkers.value.push(val);
  newMarkerInput.value = "";
};

const handleInputKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addMarker();
  }
};

const saveMarkers = async () => {
  saving.value = true;
  try {
    await datasetStore.updateMissingMarkers(editMarkers.value);
    ElMessage.success("缺失值标记已保存");
    isEditing.value = false;
    newMarkerInput.value = "";
  } catch (error: any) {
    ElMessage.error(error.message || "保存失败");
  } finally {
    saving.value = false;
  }
};

// 数据集切换时退出编辑
watch(
  () => datasetStore.currentDataset?.id,
  () => {
    if (isEditing.value) cancelEdit();
  }
);
</script>

<template>
  <div class="markers-editor">
    <span class="markers-label">缺失值标记：</span>

    <!-- 展示模式 -->
    <template v-if="!isEditing">
      <div class="markers-display">
        <el-tag v-for="marker in markers" :key="marker" size="small" type="info" effect="light" class="marker-tag">
          "{{ marker }}"
        </el-tag>
        <el-tag v-if="markers.length === 0" size="small" type="warning" effect="light"> 无配置 </el-tag>
      </div>
      <button class="edit-btn" @click="startEdit" title="编辑缺失值标记">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </template>

    <!-- 编辑模式 -->
    <template v-else>
      <div class="markers-edit-area">
        <div class="markers-edit-tags">
          <el-tag
            v-for="(marker, index) in editMarkers"
            :key="index"
            size="small"
            closable
            type="info"
            effect="plain"
            class="marker-tag"
            @close="removeMarker(index)">
            "{{ marker }}"
          </el-tag>
          <div class="add-marker-input">
            <input
              v-model="newMarkerInput"
              placeholder="输入新标记..."
              class="marker-input"
              @keydown="handleInputKeydown" />
            <button class="add-btn" @click="addMarker" title="添加标记">
              <Plus :size="14" />
            </button>
          </div>
        </div>
        <div class="edit-actions">
          <button class="save-btn" @click="saveMarkers" :disabled="saving">
            {{ saving ? "保存中..." : "保存" }}
          </button>
          <button class="cancel-btn" @click="cancelEdit" :disabled="saving">取消</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.markers-editor {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--c-bg-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  margin-bottom: var(--space-3);
  transition: all 0.2s ease;
}

.markers-editor:hover {
  border-color: var(--c-brand-border);
  box-shadow: 0 2px 8px var(--c-brand-soft);
}

.markers-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--c-text-base);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.markers-label::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 14px;
  background: linear-gradient(180deg, var(--c-brand), var(--c-brand-hover));
  border-radius: var(--radius-xs);
}

.markers-display {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  flex: 1;
}

.marker-tag {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  border-radius: var(--radius-control) !important;
  border-color: var(--c-border) !important;
  background: var(--c-bg-muted) !important;
  color: var(--c-text-secondary) !important;
  transition: all 0.2s ease;
}

.marker-tag:hover {
  border-color: var(--c-brand-border) !important;
  background: var(--c-brand-soft) !important;
  color: var(--c-brand-hover) !important;
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  color: var(--c-text-disabled);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.25s ease;
  flex-shrink: 0;
}

.edit-btn:hover {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  color: var(--c-brand-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px var(--c-brand-soft);
}

/* 编辑区域 */
.markers-edit-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.markers-edit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
}

.add-marker-input {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.marker-input {
  width: 130px;
  height: 28px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-control);
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  outline: none;
  background: var(--c-bg-surface);
  color: var(--c-text-base);
  transition: all 0.2s ease;
}

.marker-input::placeholder {
  color: var(--c-border-strong);
}

.marker-input:focus {
  border-color: var(--c-brand);
  box-shadow: 0 0 0 3px var(--c-brand-soft);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px dashed var(--c-brand-border);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: var(--text-base);
}

.add-btn:hover {
  background: var(--c-brand-muted);
  border-color: var(--c-brand);
  border-style: solid;
  transform: scale(1.05);
}

.edit-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.save-btn {
  padding: 5px 20px;
  background: linear-gradient(135deg, var(--c-brand), var(--c-brand-hover));
  color: var(--c-text-inverse);
  border: none;
  border-radius: var(--radius-control);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px var(--c-brand-soft);
}

.save-btn:hover {
  box-shadow: 0 3px 8px var(--c-brand-border);
  transform: translateY(-1px);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.cancel-btn {
  padding: 5px 20px;
  background: var(--c-bg-surface);
  color: var(--c-text-muted);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-control);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: var(--c-bg-muted);
  border-color: var(--c-border-strong);
  color: var(--c-text-secondary);
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
