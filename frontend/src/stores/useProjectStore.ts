import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { type ProjectInfo } from "@shared/types/projectInterface.ts";
import { ElMessage } from "element-plus";
import { API_ROUTES } from "@shared/constants/apiRoutes";

type Result<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export const useProjectStore = defineStore("project", () => {
  // state
  const projects = ref<ProjectInfo[]>([]);
  const currentProject = ref<ProjectInfo | null>(null);
  const loading = ref(false);

  const hasProjects = computed(() => projects.value.length > 0);
  const projectsSortedByDate = computed(() => {
    return [...projects.value].sort((a, b) => b.createdAt - a.createdAt);
  });

  // actions
  const loadProjects = async (): Promise<ProjectInfo[]> => {
    console.log("window electronAPI:", window.electronAPI);
    if (!window.electronAPI) {
      console.error("electron API not available");
      return [];
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.PROJECTS.GET_ALL);

      if (result.success) {
        projects.value = result.data.sort(
          (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt
        );

        if (currentProject.value) {
          const updated = projects.value.find(p => p.id === currentProject.value?.id);
          if (updated) {
            currentProject.value = updated;
          } else {
            currentProject.value = null;
          }
        }

        if (projects.value.length > 0 && !currentProject.value) {
          currentProject.value = projects.value[0];
        }

        return projects.value;
      } else {
        throw new Error(result.error || "获取项目列表失败");
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
      return [];
    } finally {
      loading.value = false;
    }
  };

  const setCurrentProject = (projectId: string) => {
    currentProject.value = projects.value.find(p => p.id === projectId) || null;
  };

  const createProject = async (projectInfo: {
    name: string;
    siteInfo: {
      longitude: string;
      latitude: string;
      altitude: string;
    };
  }): Promise<Result> => {
    if (!window.electronAPI) {
      return { success: false, error: "electron API not available" };
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.PROJECTS.CREATE, projectInfo);

      if (result.success) {
        await loadProjects();
        return { success: true };
      } else {
        return { success: false, error: result.error || "项目创建失败" };
      }
    } catch (err) {
      return { success: false, error: "项目创建失败" };
    } finally {
      loading.value = false;
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!window.electronAPI) {
      throw new Error("electron API not available");
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.invoke(API_ROUTES.PROJECTS.DELETE, projectId);

      if (result.success) {
        if (currentProject.value?.id === projectId) {
          currentProject.value = null;
        }
        await loadProjects();
        ElMessage.success("项目删除成功");
        return true;
      } else {
        throw new Error(result.error || "项目删除失败");
      }
    } catch (err: any) {
      console.error("项目删除失败", err);
      ElMessage.error(err.message || "项目删除失败");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const checkProjectName = async (name: string): Promise<Result<boolean>> => {
    if (!window.electronAPI) {
      throw new Error("electron API not available");
    }
    try {
      const result = await window.electronAPI.invoke(API_ROUTES.PROJECTS.CHECK_NAME, { name: name });

      if (result.success) {
        return { success: true, data: result.data.isAvailable };
      } else {
        return { success: false, error: result.error || "项目名称检查失败" };
      }
    } catch (err) {
      console.error("Check project name error", err);
      return { success: false, error: "项目名称检查失败" };
    }
  };

  return {
    // state
    projects,
    currentProject,
    loading,
    hasProjects,
    projectsSortedByDate,
    // actions
    loadProjects,
    setCurrentProject,
    createProject,
    deleteProject,
    checkProjectName,
  };
});
