<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
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
              <el-icon><Plus /></el-icon>
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
  gap: 12px;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.5);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  margin-bottom: 14px;
  transition: all 0.2s ease;
}

.markers-editor:hover {
  border-color: rgba(16, 185, 129, 0.25);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.06);
}

.markers-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.markers-label::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 14px;
  background: linear-gradient(180deg, #10b981, #059669);
  border-radius: 2px;
}

.markers-display {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.marker-tag {
  font-family: "Courier New", monospace;
  font-size: 12px;
  border-radius: 6px !important;
  border-color: rgba(229, 231, 235, 0.6) !important;
  background: rgba(248, 250, 252, 0.8) !important;
  color: #475569 !important;
  transition: all 0.2s ease;
}

.marker-tag:hover {
  border-color: rgba(16, 185, 129, 0.3) !important;
  background: rgba(236, 253, 245, 0.6) !important;
  color: #059669 !important;
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(229, 231, 235, 0.5);
  background: rgba(255, 255, 255, 0.8);
  color: #94a3b8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s ease;
  flex-shrink: 0;
}

.edit-btn:hover {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.12));
  border-color: rgba(16, 185, 129, 0.35);
  color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.12);
}

/* 编辑区域 */
.markers-edit-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.markers-edit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.add-marker-input {
  display: flex;
  align-items: center;
  gap: 6px;
}

.marker-input {
  width: 130px;
  height: 28px;
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-family: "Courier New", monospace;
  outline: none;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  transition: all 0.2s ease;
}

.marker-input::placeholder {
  color: #cbd5e1;
}

.marker-input:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.08);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px dashed rgba(16, 185, 129, 0.4);
  background: rgba(236, 253, 245, 0.5);
  color: #10b981;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.add-btn:hover {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  border-style: solid;
  transform: scale(1.05);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.save-btn {
  padding: 5px 20px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.25);
}

.save-btn:hover {
  box-shadow: 0 3px 8px rgba(16, 185, 129, 0.3);
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
  background: rgba(255, 255, 255, 0.8);
  color: #64748b;
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #475569;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
