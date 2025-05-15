// src/stores/projectStore.ts
import {ref} from "vue";
import emitter from "../utils/eventBus";
import type {ProjectInfo} from "@/types/electron";

// 创建响应式状态
const currentProject = ref<ProjectInfo | null>(null);
const projects = ref<ProjectInfo[]>([]);
const loading = ref(false);

// 设置当前项目
export function setCurrentProject(project: ProjectInfo | null) {
  currentProject.value = project;
  // 广播当前项目变更
  emitter.emit("current-project-changed", currentProject.value);
}

// 获取当前项目
export function getCurrentProject() {
  return currentProject.value;
}

// 加载项目列表
export async function loadProjects() {
  if (!window.electronAPI) {
    console.error("Electron API not available");
    return [];
  }

  try {
    loading.value = true;
    const loadedProjects = await window.electronAPI.getProjects();
    // 按创建时间降序排序（最新的在前面）
    projects.value = loadedProjects.sort((a, b) => b.createdAt - a.createdAt);

    // 如果有选中的项目，更新一下选中的项目信息
    if (currentProject.value) {
      const updated = projects.value.find(p => p.id === currentProject.value?.id);
      if (updated) {
        setCurrentProject(updated);
      } else {
        // 如果当前选中的项目已被删除，则清空选择
        setCurrentProject(null);
      }
    }

    // 如果有项目但没有选中项目，自动选择第一个
    if (projects.value.length > 0 && !currentProject.value) {
      setCurrentProject(projects.value[0]);
    }

    return projects.value;
  } catch (error) {
    console.error("Failed to load projects:", error);
    return [];
  } finally {
    loading.value = false;
  }
}

// 删除项目
export async function deleteProject(projectId: string) {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }

  try {
    loading.value = true;
    const result = await window.electronAPI.deleteProject(projectId);

    if (result.success) {
      // 如果删除的是当前选中的项目，则清空选择
      if (currentProject.value?.id === projectId) {
        setCurrentProject(null);
      }

      // 刷新项目列表
      await loadProjects();
      return true;
    } else {
      throw new Error(result.error || "删除项目失败");
    }
  } catch (error) {
    console.error("Delete project error:", error);
    throw error;
  } finally {
    loading.value = false;
  }
}

// 初始化事件监听
export function setupProjectStore() {
  // 响应获取当前项目的请求
  emitter.on("get-current-project", () => {
    emitter.emit("current-project", currentProject.value);
  });

  // 当项目被创建后，重新加载项目列表并选择新项目
  emitter.on("project-created", (project: ProjectInfo) => {
    loadProjects().then(() => {
      const newProject = projects.value.find(p => p.id === project.id);
      if (newProject) {
        setCurrentProject(newProject);
      }
    });
  });

  // 响应请求刷新项目列表的事件
  emitter.on("refresh-projects", () => {
    loadProjects();
  });

  // 处理项目选择事件
  emitter.on("project-selected", (project: ProjectInfo) => {
    setCurrentProject(project);
  });

  // 提供当前项目
  emitter.on("provide-current-project", () => {
    emitter.emit("current-project", currentProject.value);
  });
}

// 清理事件监听
export function cleanupProjectStore() {
  emitter.off("get-current-project");
  emitter.off("project-created");
  emitter.off("refresh-projects");
  emitter.off("project-selected");
  emitter.off("provide-current-project");
}

// 导出响应式状态供组件使用
export const useProjectStore = () => {
  return {
    currentProject,
    projects,
    loading,
    setCurrentProject,
    getCurrentProject,
    loadProjects,
    deleteProject,
  };
};
