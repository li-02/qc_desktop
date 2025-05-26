import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {type ProjectInfo} from "@shared/types/projectInterface.ts";
import {ElMessage} from "element-plus";

type Result<T = undefined> = T extends undefined
  ? {success: boolean; error?: string}
  : {success: boolean; data?: T; error?: string};

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
  /**
   * 加载所有项目列表
   * 如果当前有选中一个项目,则根据最新json文件更新当前项目
   * 如果没有选中项目,则默认选中第一个项目,按照创建时间升序排序
   * @returns 项目列表
   */
  const loadProjects = async (): Promise<ProjectInfo[]> => {
    if (!window.electronAPI) {
      console.error("electron API not available");
      return [];
    }
    try {
      loading.value = true;
      const loadedProjects = await window.electronAPI.getProjects();
      projects.value = loadedProjects.sort((a, b) => b.createdAt - a.createdAt);
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
    } catch (err) {
      console.error("Failed to load projects:", err);
      return [];
    } finally {
      loading.value = false;
    }
  };

  const setCurrentProject = (project: ProjectInfo) => {
    currentProject.value = project;
  };
  // const getProjects=async(...):Promise<ProjectInfo[]>=>{}

  const createProject = async (projectInfo: {
    name: string;
    siteInfo: {
      longitude: string;
      latitude: string;
      altitude: string;
    };
  }): Promise<Result> => {
    if (!window.electronAPI) {
      console.error("electron API not available");
      return {success: false, error: "electron API not available"};
    }
    try {
      loading.value = true;
      const result = await window.electronAPI.createProject(projectInfo);
      if (result.success) {
        await loadProjects();
        return {success: true};
      } else {
        return {success: false, error: result.error || "项目创建失败"};
      }
    } catch (err) {
      return {success: false, error: "项目创建失败"};
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
      const result = await window.electronAPI.deleteProject(projectId);
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
      const result = await window.electronAPI.checkProjectName(name);
      if (result.success) {
        return {success: true, data: result.isAvailable};
      } else {
        return {success: false, error: result.error || "项目名称检查失败"};
      }
    } catch (err) {
      console.error("Check project name error", err);
      return {success: false, error: "项目名称检查失败"};
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
