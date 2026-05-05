<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import emitter from "@/utils/eventBus";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Trash2,
  FolderOpen,
  X,
  Settings,
  Pencil,
  DatabaseIcon,
  Gauge,
} from "@/components/icons/iconoir";
import DatasetVersionTree from "@/components/sidebar/DatasetVersionTree.vue";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import SettingsDialog from "@/components/dialogs/SettingsDialog.vue";
import { KanbanBoard } from "@iconoir/vue";

const categoryStore = useCategoryStore();
const datasetStore = useDatasetStore();
const settingsStore = useSettingsStore();

const settingsDialogRef = ref<InstanceType<typeof SettingsDialog> | null>(null);
const openSettingsDialog = () => {
  settingsDialogRef.value?.open();
};

// 侧边栏状态
const isCollapsed = ref(false);
const expandedCategories = ref<Set<string>>(new Set());
const expandedDatasets = ref<Set<string>>(new Set());
const isBatchMode = ref(false);
const selectedCategoryIds = ref<Set<string>>(new Set());

// 排序状态
const sortType = ref<"date" | "name">("date");
const sortOrder = ref<"asc" | "desc">("asc");

const sortedCategories = computed(() => {
  const cats = [...categoryStore.categories];
  return cats.sort((a, b) => {
    if (sortType.value === "date") {
      return sortOrder.value === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
    } else {
      return sortOrder.value === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
  });
});

const handleSortCommand = (command: string) => {
  const [type, order] = command.split("-");
  sortType.value = type as "date" | "name";
  sortOrder.value = order as "asc" | "desc";
};

// 批量模式
const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value;
  selectedCategoryIds.value.clear();
};

const isAllSelected = computed(() => {
  return sortedCategories.value.length > 0 && selectedCategoryIds.value.size === sortedCategories.value.length;
});

const toggleSelectAll = (val: any) => {
  if (val) {
    sortedCategories.value.forEach(c => selectedCategoryIds.value.add(c.id));
  } else {
    selectedCategoryIds.value.clear();
  }
};

const toggleCategorySelection = (categoryId: string) => {
  if (selectedCategoryIds.value.has(categoryId)) {
    selectedCategoryIds.value.delete(categoryId);
  } else {
    selectedCategoryIds.value.add(categoryId);
  }
};

const handleBatchDelete = async () => {
  if (selectedCategoryIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedCategoryIds.value.size} 个分类吗? 此操作不可恢复。`,
      "批量删除分类",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" }
    );
    await categoryStore.batchDeleteCategories(Array.from(selectedCategoryIds.value));
    selectedCategoryIds.value.clear();
    isBatchMode.value = false;
  } catch (error) {
    if (error !== "cancel") console.error(error);
  }
};

const router = useRouter();
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 分类展开控制
const toggleCategoryExpanded = (categoryId: string) => {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId);
  } else {
    expandedCategories.value.add(categoryId);
  }
};

const expandAllCategories = () => {
  expandedCategories.value.clear();
  categoryStore.categories.forEach(c => {
    if (c.datasets?.length > 0) expandedCategories.value.add(c.id);
  });
};

const collapseAllCategories = () => {
  expandedCategories.value.clear();
};

const isCategoryExpanded = (categoryId: string): boolean => expandedCategories.value.has(categoryId);

// 数据集展开控制
const toggleDatasetExpanded = (datasetId: string) => {
  if (expandedDatasets.value.has(datasetId)) {
    expandedDatasets.value.delete(datasetId);
  } else {
    expandedDatasets.value.add(datasetId);
  }
};

const isDatasetExpanded = (datasetId: string): boolean => expandedDatasets.value.has(datasetId);

// 分类选择
const selectCategory = (categoryId: string) => {
  categoryStore.setCurrentCategory(categoryId);
  router.push("/");
};

const handleCategoryClick = (categoryId: string) => {
  selectCategory(categoryId);
  toggleCategoryExpanded(categoryId);
};

// 处理版本选择
const handleVersionSelect = async (categoryId: string, datasetId: string, versionId: number) => {
  categoryStore.setCurrentCategory(categoryId);
  if (datasetStore.currentDataset?.id !== datasetId) {
    await datasetStore.setCurrentDataset(datasetId);
  }
  await datasetStore.setCurrentVersion(versionId);
  router.push("/data-view");
};

// 新建分类
const createNewCategory = () => {
  emitter.emit("open-create-category-dialog");
};

// 编辑分类
const editCategory = (categoryId: string, categoryName: string) => {
  emitter.emit("open-edit-category-dialog", { id: categoryId, name: categoryName });
};

// 导入数据
const handleImportData = (categoryId?: string) => {
  if (categoryId) {
    categoryStore.setCurrentCategory(categoryId);
  }
  if (!categoryStore.currentCategory) {
    ElMessage.warning("请先选择一个分类");
    return;
  }
  emitter.emit("open-import-data-dialog");
};

// 删除分类
const confirmDeleteCategory = (categoryId: string) => {
  const category = categoryStore.categories.find(c => c.id === categoryId);
  if (!category) return;
  ElMessageBox.confirm(`确定要删除分类 "${category.name}" 吗? 此操作不可恢复。`, "删除分类", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      await categoryStore.deleteCategory(category.id);
    })
    .catch(() => {});
};

// 删除数据集
const confirmDeleteDataset = (categoryId: string, datasetId: string) => {
  const category = categoryStore.categories.find(c => c.id === categoryId);
  const dataset = category?.datasets?.find((d: any) => d.id === datasetId);
  if (!dataset) return;
  ElMessageBox.confirm(`确定要删除数据集 "${dataset.name}" 吗? 此操作不可恢复。`, "删除数据集", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      await datasetStore.deleteDataset(categoryId, datasetId);
      ElMessage.success("数据集删除成功");
    })
    .catch(() => {});
};

// 工具函数
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getTotalFiles = (category: any): number => {
  const datasets = Array.isArray(category?.datasets) ? category.datasets : [];
  return datasets.reduce((sum: number, d: any) => {
    const fc = typeof d?.fileCount === "number" ? d.fileCount : 0;
    return sum + (fc > 0 ? fc : d?.originalFile ? 1 : 0);
  }, 0);
};

const getTotalSize = (category: any): string => {
  const datasets = Array.isArray(category?.datasets) ? category.datasets : [];
  const totalBytes = datasets.reduce((sum: number, d: any) => {
    if (typeof d?.totalSizeBytes === "number" && d.totalSizeBytes > 0) return sum + d.totalSizeBytes;
    if (typeof d?.originalFileSizeBytes === "number" && d.originalFileSizeBytes > 0)
      return sum + d.originalFileSizeBytes;
    return sum;
  }, 0);
  return formatBytes(totalBytes);
};

const getDatasetIcon = (type: string): string => {
  const iconMap: Record<string, string> = { flux: "📊", micrometeorology: "🌡️", aqi: "🌫️", sapflow: "🌊", nai: "⚡" };
  return iconMap[type] || "📄";
};

const getDatasetTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    flux: "Flux",
    micrometeorology: "Micro",
    aqi: "AQI",
    sapflow: "Sap",
    nai: "NAI",
  };
  return labelMap[type] || type.toUpperCase();
};

const handleImportSuccess = () => {
  if (categoryStore.currentCategory) {
    expandedCategories.value.add(categoryStore.currentCategory.id);
    categoryStore.loadCategories();
  }
};

onMounted(async () => {
  await categoryStore.loadCategories();
  if (!categoryStore.currentCategory && sortedCategories.value.length > 0) {
    selectCategory(sortedCategories.value[0].id);
  }
  settingsStore.initSettings();
  emitter.on("data-imported", handleImportSuccess);
});

onUnmounted(() => {
  emitter.off("data-imported", handleImportSuccess);
});
</script>

<template>
  <!-- 应用窗口 -->
  <div class="app-container">
    <!-- 侧边栏 -->
    <div :class="['sidebar', { collapsed: isCollapsed }]">
      <!-- 应用标题区域 -->
      <div class="app-header">
        <div class="app-title">
          <div class="app-icon">
            <span>🌱</span>
          </div>
          <div v-if="!isCollapsed" class="app-title-text">
            <div class="app-name">生态监测平台</div>
            <div class="app-subtitle">生态监测桌面端</div>
          </div>
        </div>
        <button v-if="!isCollapsed" class="settings-btn" @click="openSettingsDialog" title="系统设置">
          <Settings :size="15" />
        </button>
      </div>

      <!-- 侧边栏折叠按钮 -->
      <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '折叠侧边栏'">
        <span class="collapse-icon">
          <ChevronRight v-if="isCollapsed" :size="11" />
          <ChevronLeft v-else :size="11" />
        </span>
      </button>

      <!-- 分类管理区域 -->
      <div class="projects-section">
        <div class="section-header" v-show="!isCollapsed">
          <div class="section-title-wrap">
            <div class="section-title">分类管理</div>
            <span v-if="isBatchMode && selectedCategoryIds.size > 0" class="selected-badge">
              已选 {{ selectedCategoryIds.size }}
            </span>
          </div>

          <!-- 批量模式操作栏 -->
          <div v-if="isBatchMode" class="section-actions batch-actions">
            <el-checkbox class="batch-select-all" :model-value="isAllSelected" @change="toggleSelectAll" size="small"
              >全选</el-checkbox
            >
            <button
              class="action-btn delete-btn"
              @click="handleBatchDelete"
              title="删除选中"
              :disabled="selectedCategoryIds.size === 0"
              :style="{ color: selectedCategoryIds.size > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)' }">
              <Trash2 :size="14" />
            </button>
            <button class="action-btn" @click="toggleBatchMode" title="退出批量模式">
              <X :size="14" />
            </button>
          </div>

          <!-- 正常模式操作栏 -->
          <div v-else class="section-actions">
            <button class="action-btn" @click="categoryStore.loadCategories" title="刷新分类列表">
              <RefreshCw :size="14" />
            </button>
            <el-dropdown trigger="click" @command="handleSortCommand">
              <button class="action-btn" title="排序">
                <ArrowUpDown :size="14" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="date-asc" :class="{ active: sortType === 'date' && sortOrder === 'asc' }"
                    >创建时间 (正序)</el-dropdown-item
                  >
                  <el-dropdown-item command="date-desc" :class="{ active: sortType === 'date' && sortOrder === 'desc' }"
                    >创建时间 (倒序)</el-dropdown-item
                  >
                  <el-dropdown-item command="name-asc" :class="{ active: sortType === 'name' && sortOrder === 'asc' }"
                    >分类名称 (正序)</el-dropdown-item
                  >
                  <el-dropdown-item command="name-desc" :class="{ active: sortType === 'name' && sortOrder === 'desc' }"
                    >分类名称 (倒序)</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <button class="action-btn" @click="expandAllCategories" title="展开所有分类">
              <ChevronDown :size="14" />
            </button>
            <button class="action-btn" @click="collapseAllCategories" title="折叠所有分类">
              <ChevronUp :size="14" />
            </button>
            <button class="action-btn" @click="toggleBatchMode" title="批量管理">
              <FolderOpen :size="14" />
            </button>
            <button class="action-btn" @click="createNewCategory" title="新建分类">
              <Plus :size="14" />
            </button>
          </div>
        </div>

        <!-- 分类列表 -->
        <div class="projects-list" v-show="!isCollapsed">
          <!-- 空状态 -->
          <div v-if="!categoryStore.hasCategories" class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-text">
              还没有创建任何分类<br />
              开始您的生态监测之旅
            </div>
            <button class="empty-action" @click="createNewCategory">创建第一个分类</button>
          </div>

          <!-- 分类列表 -->
          <div v-else class="projects-container">
            <div
              v-for="category in sortedCategories"
              :key="category.id"
              :class="[
                'project-item',
                { active: categoryStore.currentCategory?.id === category.id, 'batch-mode': isBatchMode },
              ]"
              @click="isBatchMode ? toggleCategorySelection(category.id) : handleCategoryClick(category.id)">
              <!-- 批量选择复选框 -->
              <div v-if="isBatchMode" class="project-checkbox">
                <el-checkbox
                  :model-value="selectedCategoryIds.has(category.id)"
                  @change="toggleCategorySelection(category.id)"
                  @click.stop />
              </div>

              <!-- 分类头部 -->
              <div class="project-header">
                <button
                  class="project-expand-caret"
                  :class="{ expanded: isCategoryExpanded(category.id), invisible: !category.datasets?.length }"
                  @click.stop="toggleCategoryExpanded(category.id)">
                  <ChevronRight :size="12" />
                </button>

                <div class="project-main">
                  <div class="project-icon">📁</div>
                  <div class="project-info">
                    <div class="project-name">{{ category.name }}</div>
                    <div class="project-meta">
                      <span>{{ category.datasets?.length || 0 }} 个数据集</span>
                    </div>
                  </div>
                </div>

                <div class="project-right">
                  <div class="project-actions">
                    <button class="project-action-btn" @click.stop="handleImportData(category.id)" title="导入数据集">
                      <Plus :size="12" />
                    </button>
                    <button
                      class="project-action-btn"
                      @click.stop="editCategory(category.id, category.name)"
                      title="编辑分类">
                      <Pencil :size="12" />
                    </button>
                    <button
                      class="project-action-btn delete-btn"
                      @click.stop="confirmDeleteCategory(category.id)"
                      title="删除分类">
                      <Trash2 :size="12" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- 分类统计 -->
              <div class="project-stats">
                <div class="stat-item">
                  <div class="stat-icon datasets"></div>
                  <span>{{ category.datasets?.length || 0 }} 数据集</span>
                </div>
                <div class="stat-item">
                  <div class="stat-icon files"></div>
                  <span>{{ getTotalFiles(category) }} 文件</span>
                </div>
                <div class="stat-item">
                  <div class="stat-icon size"></div>
                  <span>{{ getTotalSize(category) }}</span>
                </div>
              </div>

              <!-- 数据集列表 -->
              <div :class="['datasets-list', { expanded: isCategoryExpanded(category.id) }]">
                <div v-if="category.datasets?.length > 0" class="datasets-container">
                  <div v-for="dataset in category.datasets" :key="dataset.id" class="dataset-wrapper">
                    <div
                      :class="[
                        'dataset-item',
                        {
                          active: datasetStore.currentDataset?.id === dataset.id,
                          expanded: isDatasetExpanded(dataset.id),
                        },
                      ]"
                      @click.stop="toggleDatasetExpanded(dataset.id)">
                      <div class="dataset-header">
                        <button
                          class="dataset-expand-btn"
                          :class="{ expanded: isDatasetExpanded(dataset.id) }"
                          @click.stop="toggleDatasetExpanded(dataset.id)">
                          <ChevronRight :size="10" />
                        </button>
                        <div class="dataset-icon">{{ getDatasetIcon(dataset.type) }}</div>
                        <div class="dataset-name">{{ dataset.name }}</div>
                        <div class="dataset-type">{{ getDatasetTypeLabel(dataset.type) }}</div>
                        <button
                          class="dataset-delete-btn"
                          @click.stop="confirmDeleteDataset(category.id, dataset.id)"
                          title="删除数据集">
                          <Trash2 :size="10" />
                        </button>
                      </div>
                    </div>
                    <DatasetVersionTree
                      :dataset-id="dataset.id"
                      :is-expanded="isDatasetExpanded(dataset.id)"
                      @select-version="versionId => handleVersionSelect(category.id, dataset.id, versionId)" />
                  </div>
                </div>
                <div v-else class="datasets-empty">
                  <div class="datasets-empty-icon">📄</div>
                  <div class="datasets-empty-text">暂无数据集</div>
                  <button class="datasets-empty-action" @click.stop="handleImportData(category.id)">
                    导入第一个数据集
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部导航 -->
      <div class="sidebar-footer" v-show="!isCollapsed">
        <button
          class="sidebar-nav-btn"
          :class="{ active: $route.path === '/workflow' }"
          @click="router.push('/workflow')"
          title="自动化工作流">
          <span class="nav-icon-wrap">
            <KanbanBoard class="nav-icon" :size="18" stroke-width="1.8" />
          </span>
          <span class="nav-text">自动化工作流</span>
        </button>
        <button
          class="sidebar-nav-btn"
          :class="{ active: $route.path === '/data-source' }"
          @click="router.push('/data-source')"
          title="数据源管理">
          <span class="nav-icon-wrap">
            <DatabaseIcon class="nav-icon" :size="18" stroke-width="1.8" />
          </span>
          <span class="nav-text">数据源管理</span>
        </button>
        <button
          class="sidebar-nav-btn"
          :class="{ active: $route.path === '/workflow/beon-qc' }"
          @click="router.push('/workflow/beon-qc')"
          title="BEON QC 管线">
          <span class="nav-icon-wrap">
            <Gauge class="nav-icon" :size="18" stroke-width="1.8" />
          </span>
          <span class="nav-text">BEON QC</span>
        </button>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <div class="main-header">
        <!-- 主导航菜单 -->
        <!--        <el-menu-->
        <!--          mode="horizontal"-->
        <!--          :default-active="activeIndex"-->
        <!--          class="main-nav"-->
        <!--          background-color="#1F2937"-->
        <!--          text-color="#E5E7EB"-->
        <!--          active-text-color="#FFFFFF"-->
        <!--          router>-->
        <!--          <el-menu-item v-for="item in mainMenuItems" :key="item.path" :index="item.path">-->
        <!--            <el-icon>-->
        <!--              <component :is="item.icon" />-->
        <!--            </el-icon>-->
        <!--            <template #title>{{ item.name }}</template>-->
        <!--          </el-menu-item>-->
        <!--        </el-menu>-->
      </div>

      <!-- 内容区域 -->
      <div class="content-area">
        <router-view
          v-if="
            categoryStore.currentCategory ||
            $route.path === '/' ||
            $route.path === '/workflow' ||
            $route.path.startsWith('/workflow/') ||
            $route.path === '/data-source' ||
            $route.path === '/dialog-gallery'
          " />
        <div v-else class="content-empty">
          <el-empty description="请先选择一个分类" :image-size="128">
            <el-button type="primary" @click="createNewCategory">新建分类</el-button>
          </el-empty>
        </div>
      </div>
    </div>

    <!-- 设置对话框 -->
    <SettingsDialog ref="settingsDialogRef" />
  </div>
</template>

<style scoped>
/* ── 应用主容器 ── */
.app-container {
  display: flex;
  height: 100vh;
  background: var(--c-bg-app);
}

/* ── 侧边栏 ── */
.sidebar {
  width: var(--sb-width); /* 220px */
  background: var(--sb-bg);
  border-right: none;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 12px rgba(45, 106, 79, 0.1);
  position: relative;
  transition: width var(--duration-slower) var(--ease-inout);
  overflow: visible;
  z-index: var(--z-sticky);
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 64px;
}

/* ── 侧边栏内局部 token 覆盖 — 浅色主题，与全局一致 ── */
.sidebar {
  --c-bg-surface: rgba(255, 255, 255, 0.55);
  --c-bg-muted: rgba(255, 255, 255, 0.3);
  --c-bg-subtle: rgba(255, 255, 255, 0.2);
  --c-border: rgba(45, 106, 79, 0.15);
  --c-border-strong: rgba(45, 106, 79, 0.25);
  --c-border-subtle: rgba(45, 106, 79, 0.08);
}

/* ── 应用标题区 ── */
.app-header {
  height: var(--sb-header-height); /* 52px */
  padding: var(--sb-header-padding);
  border-bottom: 1px solid var(--sb-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: var(--space-2);
}

.sidebar.collapsed .app-header {
  padding: 0 var(--space-3);
  justify-content: center;
}

.app-title {
  display: flex;
  align-items: center;
  gap: var(--space-2-5);
  min-width: 0;
  flex: 1;
}

.sidebar.collapsed .app-title {
  justify-content: center;
}

.app-icon {
  width: 32px;
  height: 32px;
  background: rgba(116, 198, 157, 0.2);
  border: 1px solid rgba(116, 198, 157, 0.35);
  border-radius: var(--radius-panel);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.app-title-text {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity var(--duration-slow) var(--ease-inout),
    transform var(--duration-slow) var(--ease-inout);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .app-title-text {
  opacity: 0;
  transform: translateX(-12px);
  width: 0;
}

.app-name {
  font-size: var(--text-md);
  font-weight: var(--font-bold);
  color: var(--c-text-primary);
  letter-spacing: var(--tracking-tight);
  white-space: nowrap;
  line-height: var(--leading-tight);
}

.app-subtitle {
  font-size: var(--text-2xs);
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-medium);
  white-space: nowrap;
}

/* ── 设置按钮 ── */
.settings-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--c-text-muted);
  transition: var(--transition-colors);
  flex-shrink: 0;
}

.settings-btn:hover {
  background: var(--c-brand-soft);
  color: var(--c-brand);
  border-color: var(--c-brand-border);
}

/* ── 折叠按钮（浮于右侧边缘）── */
.collapse-btn {
  position: absolute;
  top: 50%;
  right: -11px;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-colors), var(--transition-shadow);
  color: var(--c-text-disabled);
  z-index: var(--z-raised);
  box-shadow: var(--shadow-sm);
  padding: 0;
}

.collapse-btn:hover {
  color: var(--c-brand);
  border-color: var(--c-brand-border);
  background: var(--c-brand-soft);
  box-shadow: var(--shadow-brand-sm);
  transform: translateY(-50%);
}

.collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 分类管理区域 ── */
.projects-section {
  flex: 1;
  padding: 0 var(--space-3) var(--space-4);
  overflow-y: auto;
  position: relative;
  z-index: var(--z-raised);
  transition:
    opacity var(--duration-slow) var(--ease-inout),
    transform var(--duration-slow) var(--ease-inout);
}

.sidebar.collapsed .projects-section {
  opacity: 0;
  transform: translateX(-12px);
  pointer-events: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1-5);
  padding: var(--space-3) var(--space-0-5) var(--space-2);
  position: sticky;
  top: 0;
  z-index: var(--z-raised);
  background: var(--sb-bg);
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-title {
  font-size: var(--sb-section-font);
  font-weight: var(--sb-section-weight);
  color: var(--sb-section-color);
  text-transform: uppercase;
  letter-spacing: var(--sb-section-tracking);
}

.selected-badge {
  font-size: var(--text-xs);
  color: var(--c-text-secondary);
  background: var(--c-bg-subtle);
  padding: var(--space-0-5) var(--space-2);
  border-radius: var(--radius-full);
  border: 1px solid var(--c-border);
}

.section-actions {
  display: flex;
  gap: var(--space-1-5);
}

.batch-actions {
  align-items: center;
}

.batch-select-all {
  margin-right: var(--space-1-5);
  height: var(--btn-height-xs);
}

.action-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-surface);
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-colors);
  color: var(--c-text-muted);
  font-size: var(--text-md);
}

.action-btn:hover {
  background: var(--c-brand-soft);
  color: var(--c-brand-hover);
  border-color: var(--c-brand-border);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 分类项 ── */
.project-item {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  cursor: pointer;
  transition: var(--transition-base);
  position: relative;
  overflow: visible;
  box-shadow: var(--shadow-xs);
}

.project-item.batch-mode {
  cursor: default;
}

.project-checkbox {
  position: absolute;
  left: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--z-raised);
}

.project-item.batch-mode .project-header,
.project-item.batch-mode .project-stats,
.project-item.batch-mode .datasets-list {
  padding-left: var(--space-6);
  transition: padding-left var(--duration-slow) var(--ease-inout);
}

/* 左侧品牌色竖条 */
.project-item::before {
  content: "";
  position: absolute;
  top: var(--space-2-5);
  left: 0;
  width: 2px;
  bottom: var(--space-2-5);
  background: var(--c-brand);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  transform: scaleY(0);
  transition: transform var(--duration-slow) var(--ease-inout);
}

.project-item:hover {
  border-color: var(--c-border-strong);
  box-shadow: var(--shadow-md);
}

.project-item:hover::before {
  transform: scaleY(1);
}

.project-item.active {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  box-shadow: var(--shadow-brand-sm);
}

.project-item.active::before {
  transform: scaleY(1);
}

/* ── 分类头部 ── */
.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2-5);
  gap: var(--space-2);
}

.project-expand-caret {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-base);
  color: var(--c-text-disabled);
  font-size: var(--text-sm);
  flex-shrink: 0;
  margin-left: calc(-1 * var(--space-1));
}

.project-expand-caret:hover {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}

.project-expand-caret.expanded {
  transform: rotate(90deg);
  color: var(--c-brand);
}

.project-expand-caret.invisible {
  opacity: 0;
  pointer-events: none;
}

.project-main {
  display: flex;
  align-items: center;
  gap: var(--space-2-5);
  min-width: 0;
  flex: 1;
}

.project-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.project-icon {
  width: 32px;
  height: 32px;
  background: var(--c-bg-subtle);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-lg);
  flex-shrink: 0;
  transition: var(--transition-colors);
}

.project-item:hover .project-icon,
.project-item.active .project-icon {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
}

.project-info {
  min-width: 0;
  flex: 1;
}

.project-name {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--c-text-base);
  margin-bottom: var(--space-0-5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: var(--transition-colors);
}

.project-item.active .project-name {
  color: var(--c-brand-active);
}

.project-meta {
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-item.active .project-meta {
  color: var(--c-brand-hover);
}

.project-actions {
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-fast) var(--ease-inout);
  flex-shrink: 0;
  background: var(--c-bg-surface);
  padding: var(--space-0-5);
  border-radius: var(--radius-control);
  border: 1px solid var(--c-border);
}

.project-item:hover .project-actions {
  opacity: 1;
  pointer-events: auto;
}

.project-item.active .project-actions {
  background: var(--c-bg-surface);
  border-color: var(--c-brand-border);
}

.project-action-btn {
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-colors);
  color: var(--c-text-muted);
  font-size: var(--text-sm);
}

.project-action-btn:hover {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  color: var(--c-brand-hover);
}

.project-action-btn.delete-btn:hover {
  background: var(--c-danger-bg);
  border-color: var(--c-danger-border);
  color: var(--c-danger-hover);
}

/* ── 分类统计 ── */
.project-stats {
  display: flex;
  align-items: center;
  gap: var(--space-2-5);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--c-border);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  font-size: var(--text-xs);
  color: var(--c-text-muted);
}

.stat-icon {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}

.stat-icon.datasets {
  background: var(--c-warning);
}
.stat-icon.files {
  background: var(--color-purple-500);
}
.stat-icon.size {
  background: var(--c-chart-6);
}

/* ── 数据集列表（CSS Grid 展开动画）── */
.datasets-list {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  margin-top: 0;
  transition:
    grid-template-rows var(--duration-slower) var(--ease-inout),
    opacity var(--duration-slow) var(--ease-inout),
    margin-top var(--duration-slower) var(--ease-inout);
}

.datasets-list > .datasets-container,
.datasets-list > .datasets-empty {
  overflow: hidden;
}

.datasets-list.expanded {
  grid-template-rows: 1fr;
  opacity: 1;
  margin-top: var(--space-2-5);
}

.datasets-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-1-5);
  position: relative;
}

/* 连接线 */
.datasets-container::before {
  content: "";
  position: absolute;
  left: 16px;
  top: var(--space-1);
  bottom: var(--space-2-5);
  width: 1px;
  background: var(--c-brand-border);
  border-radius: var(--radius-xs);
}

.dataset-wrapper {
  margin-bottom: var(--space-0-5);
  position: relative;
}

.dataset-item {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  padding: var(--space-1-5) var(--space-2) var(--space-1-5) var(--space-2-5);
  cursor: pointer;
  transition: var(--transition-base);
  position: relative;
  display: flex;
  align-items: center;
  margin-left: var(--space-4);
}

/* 水平连接线 */
.dataset-item::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  width: 8px;
  height: 1px;
  background: var(--color-primary-200);
}

.dataset-item:hover {
  border-color: var(--c-border-strong);
  box-shadow: var(--shadow-sm);
}

.dataset-item.active {
  background: var(--c-brand-soft);
  border-color: var(--c-brand-border);
  box-shadow: var(--shadow-brand-sm);
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  width: 100%;
}

.dataset-expand-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-base);
  color: var(--c-text-disabled);
  font-size: var(--text-xs);
  flex-shrink: 0;
  padding: 0;
}

.dataset-expand-btn:hover {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}

.dataset-expand-btn.expanded {
  transform: rotate(90deg);
  color: var(--c-brand);
}

.dataset-icon {
  width: 18px;
  height: 18px;
  background: var(--c-bg-muted);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-3xs);
  color: var(--c-text-muted);
  border: 1px solid var(--c-border);
  transition: var(--transition-colors);
}

.dataset-item:hover .dataset-icon,
.dataset-item.active .dataset-icon {
  background: var(--c-brand-soft);
  color: var(--c-brand-hover);
  border-color: var(--c-brand-border);
}

.dataset-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-secondary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: var(--transition-colors);
}

.dataset-item.active .dataset-name {
  color: var(--c-brand-active);
  font-weight: var(--font-semibold);
}

.dataset-type {
  font-size: var(--text-2xs);
  padding: var(--space-0-5) var(--space-1-5);
  background: var(--c-bg-muted);
  color: var(--c-text-muted);
  border-radius: var(--radius-xs);
  font-weight: var(--font-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  border: 1px solid var(--c-border);
}

.dataset-delete-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-colors);
  color: var(--c-danger);
  font-size: var(--text-sm);
  opacity: 0;
  margin-left: var(--space-1);
}

.dataset-item:hover .dataset-delete-btn {
  opacity: 1;
}

.dataset-delete-btn:hover {
  background: var(--c-danger-bg);
  color: var(--c-danger-hover);
}

/* ── 数据集空状态 ── */
.datasets-empty {
  text-align: center;
  padding: var(--space-4) var(--space-3);
  color: var(--c-text-disabled);
}

.datasets-empty-icon {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-2);
}

.datasets-empty-text {
  font-size: var(--text-xs);
  margin-bottom: var(--space-2);
  color: var(--c-text-muted);
}

.datasets-empty-action {
  background: linear-gradient(135deg, var(--c-brand) 0%, var(--c-brand-hover) 100%);
  color: var(--c-text-inverse);
  border: none;
  border-radius: var(--radius-control);
  padding: var(--space-1-5) var(--space-3);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: var(--transition-base);
}

.datasets-empty-action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-brand-md);
}

/* ── 分类列表空状态 ── */
.empty-state {
  text-align: center;
  padding: var(--space-8) var(--space-5);
  color: var(--c-text-muted);
}

.empty-icon {
  width: 48px;
  height: 48px;
  background: var(--c-bg-subtle);
  border-radius: var(--radius-panel);
  border: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-3);
  font-size: var(--text-3xl);
}

.empty-text {
  font-size: var(--text-base);
  margin-bottom: var(--space-4);
  line-height: var(--leading-relaxed);
  color: var(--c-text-secondary);
}

.empty-action {
  background: linear-gradient(135deg, var(--c-brand) 0%, var(--c-brand-hover) 100%);
  color: var(--c-text-inverse);
  border: none;
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: var(--transition-base);
}

.empty-action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-brand-md);
}

/* ── 主内容区 ── */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
  overflow: hidden;
  min-width: 0;
}

.main-header {
  border-bottom: none;
  background: var(--c-bg-surface);
}

.content-area {
  flex: 1;
  padding: 0;
  background: var(--c-bg-app);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.content-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 底部导航 ── */
.sidebar-footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--sb-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
}

.sidebar-nav-btn {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  column-gap: var(--space-2-5);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-panel);
  background: var(--c-bg-surface);
  color: var(--c-text-secondary);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: var(--transition-colors);
}

.sidebar-nav-btn:hover {
  background: var(--c-brand-soft);
  color: var(--c-brand);
  border-color: var(--c-brand-border);
}

.sidebar-nav-btn.active {
  background: var(--c-brand-soft);
  color: var(--c-brand);
  border-color: var(--c-brand);
  font-weight: var(--font-semibold);
}

.sidebar-nav-btn .nav-icon-wrap {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-nav-btn .nav-icon {
  width: 18px;
  height: 18px;
  display: block;
  flex-shrink: 0;
}
.sidebar-nav-btn .nav-text {
  min-width: 0;
  white-space: nowrap;
  text-align: left;
}

/* ── 滚动条 ── */
.projects-section::-webkit-scrollbar {
  width: 3px;
}
.projects-section::-webkit-scrollbar-track {
  background: transparent;
}
.projects-section::-webkit-scrollbar-thumb {
  background: var(--c-brand-border);
  border-radius: var(--radius-full);
}

/* ── Element Plus 局部覆盖 ── */
:deep(.el-dropdown-menu__item.active) {
  color: var(--c-brand);
  background-color: var(--c-brand-soft);
}

:deep(.el-dropdown-menu) {
  border-radius: var(--radius-overlay);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--c-border);
}

:deep(.el-dropdown-menu__item) {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-base);
  transition: var(--transition-colors);
}

:deep(.el-dropdown-menu__item:hover) {
  background-color: var(--c-brand-soft);
  color: var(--c-brand-hover);
}

:deep(.el-button-group .el-button) {
  margin-left: 0;
}
:deep(.el-button-group .el-button:first-child) {
  border-right: none;
}
:deep(.el-button-group .el-button + .el-button) {
  margin-left: -1px;
}

/* ── 加载动画 ── */
.action-btn[loading] {
  position: relative;
  color: transparent;
}

.action-btn[loading]::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--c-brand-hover);
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: qc-spin 0.6s linear infinite;
}
</style>
