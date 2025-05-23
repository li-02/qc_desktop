import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

interface ProjectBaseInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}
interface DatasetBaseInfo {
  id: string;
  name: string;
  type: string;
  dirPath: string;
  originalFile: string;
  createdAt: number;
}
// 项目信息
interface ProjectInfo extends ProjectBaseInfo {
  lastUpdated: number;
  siteInfo: {
    longitude: string;
    latitude: string;
    altitude: string;
  };
  datasets: {
    id: string;
    name: string; //数据集名字
    type: string;
    dirPath: string; // 数据集目录
    originalFile: string;
    createdAt: number;
  }[];
}
interface DatasetInfo {
  id: string;
  name: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  belongTo: string;
  dirPath: string;
  missingValueTypes: string[];
  originalFile: {
    name: string;
    filePath: string;
    size: number;
    rows: number;
    columns: string[];
  };
  // 这部分有待扩展
  processedFiles: {
    name: string;
    filePath: string;
    size: number;
    rows: number;
    columns: string[];
  }[]; // 处理后的文件
}
// 记录所有项目的基本信息并持久化存储
interface ProjectsIndexFile {
  lastUpdated: number;
  projects: ProjectBaseInfo[];
}

// 项目管理类
export class ProjectManager {
  private projectsDir: string;
  private indexPath: string;
  private projects: ProjectInfo[] = [];

  constructor(projectsDir: string, indexPath: string) {
    this.projectsDir = projectsDir;
    this.indexPath = indexPath;
    this.ensureProjectsDir();
    this.loadProjectsIndex();
  }

  // -------------------------项目索引管理--------------------
  /**
   * 加载项目索引文件,获取所有项目信息
   * 本方法从index.json读取项目基本信息，然后加载每个项目的完整配置project.json
   * 同时执行数据清理：移除不存在项目，同步索引与实际项目状态
   * 加载完成后会重新保存索引文件，确保索引与实际项目保持一致
   */
  private loadProjectsIndex(): void {
    try {
      // 如果索引文件不存在，则创建一个新的索引文件
      if (!fs.existsSync(this.indexPath)) {
        this.saveProjectsIndex();
        return;
      }

      const indexData = fs.readFileSync(this.indexPath, "utf-8");
      const indexFile: ProjectsIndexFile = JSON.parse(indexData);

      this.projects = [];
      // 找到所有项目信息保存至this.projects
      for (const baseInfo of indexFile.projects) {
        if (!fs.existsSync(baseInfo.path)) {
          continue;
        }
        const projectConfigPath = path.join(baseInfo.path, "project.json");
        if (!fs.existsSync(projectConfigPath)) {
          continue;
        }
        try {
          const projectData = fs.readFileSync(projectConfigPath, "utf-8");
          const projectInfo: ProjectInfo = JSON.parse(projectData);
          this.projects.push(projectInfo);
        } catch (err: any) {
          console.error(`Failed to load project ${baseInfo.name}:`, err);
          continue;
        }
      }
      this.saveProjectsIndex();
    } catch (err) {
      console.error("Failed to load projects:", err);
      this.projects = [];
      this.saveProjectsIndex();
    }
  }

  /**
   * 从内存中获取当前的所有项目信息，将基本信息保存到项目索引文件
   * 并更新索引文件的最后更新时间
   */
  private saveProjectsIndex(): void {
    try {
      const indexFile: ProjectsIndexFile = {
        lastUpdated: Date.now(),
        projects: this.projects.map((project) =>
          this.toProjectBaseInfo(project)
        ),
      };
      fs.writeFileSync(
        this.indexPath,
        JSON.stringify(indexFile, null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error("Failed to save projects index:", err);
    }
  }

  // #region 项目管理

  /**
   * 创建项目，将项目基本信息保存在索引文件中，详细信息保存在项目目录下的project.json文件中
   * 并将新项目信息保存到内存中this.projects
   * @param projectInfo 项目名称,经纬度,海拔
   * @returns 新创建的项目基本信息
   * @throws 如果项目名称已存在，则抛出错误
   */
  public createProject(projectInfo: {
    name: string;
    siteInfo: { longitude: string; latitude: string; altitude: string };
  }): ProjectBaseInfo {
    try {
      if (this.isProjectNameExists(projectInfo.name)) {
        throw new Error(`项目名称 "${projectInfo.name}" 已存在`);
      }
      const projectId = uuidv4();
      const projectPath = path.join(this.projectsDir, projectInfo.name);

      fs.mkdirSync(projectPath, { recursive: true });

      const newProject: ProjectInfo = {
        id: projectId,
        name: projectInfo.name,
        path: projectPath,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        siteInfo: projectInfo.siteInfo,
        datasets: [],
      };
      this.saveProjectConfig(newProject);
      this.projects.push(newProject);
      this.saveProjectsIndex();

      return this.toProjectBaseInfo(newProject);
    } catch (err) {
      console.error("Failed to create project:", err);
      throw err;
    }
  }

  /**
   * 删除项目
   * 从内存中检索要删除的项目,并将其从项目列表中移除
   * 更新索引文件index.json
   * @param projectId 项目ID
   * @returns 是否成功删除
   * @throws 如果项目不存在或删除失败，则抛出错误
   */
  public deleteProject(projectId: string): boolean {
    try {
      const projectIndex = this.projects.findIndex((p) => p.id === projectId);

      if (projectIndex === -1) {
        throw new Error(`找不到ID为 "${projectId}" 的项目`);
      }

      const project = this.projects[projectIndex];

      if (fs.existsSync(project.path)) {
        fs.rmSync(project.path, { recursive: true, force: true });
      }

      this.projects.splice(projectIndex, 1);
      this.saveProjectsIndex();

      return true;
    } catch (err) {
      console.error("Failed to delete project:", err);
      throw err;
    }
  }

  /**
   * 更新项目信息(不包含项目id和数据集信息)
   * @param projectId
   * @param updates
   * @returns
   */
  public updateProject(
    projectId: string,
    updates: Partial<Omit<ProjectInfo, "id" | "datasets">>
  ): ProjectInfo {
    const projectIndex = this.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      throw new Error(`找不到ID为 "${projectId}" 的项目`);
    }

    const project = this.projects[projectIndex];

    // 更新项目信息
    const updatedProject: ProjectInfo = {
      ...project,
      ...updates,
      id: project.id, // 确保ID不变
      datasets: project.datasets, // 确保数据集信息不变
      lastUpdated: Date.now(),
    };

    // 替换原项目
    this.projects[projectIndex] = updatedProject;

    // 保存项目配置
    this.saveProjectConfig(updatedProject);

    // 如果基本信息变化了，也更新索引文件
    if (updates.name || updates.path) {
      this.saveProjectsIndex();
    }

    return updatedProject;
  }

  /**
   * 获取单个项目
   * @param projectId  项目ID
   * @returns 项目信息
   */
  public getProject(projectId: string): ProjectInfo | undefined {
    return this.projects.find((p) => p.id === projectId);
  }

  /**
   * 获取所有项目的信息
   * @returns 项目信息数组
   */
  public getProjects(): ProjectInfo[] {
    return this.projects;
  }

  /**
   * 保存项目详细信息到项目目录下project.json文件
   * @param project 项目信息
   */
  private saveProjectConfig(project: ProjectInfo): void {
    try {
      const projectConfigPath = path.join(project.path, "project.json");
      fs.writeFileSync(
        projectConfigPath,
        JSON.stringify(project, null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error(`Failed to save project config for ${project.name}:`, err);
    }
  }

  /**
   * 检查项目名称是否已存在
   * @param name 项目名称
   * @returns 如果项目名称已存在，则返回true，否则返回false
   */
  public isProjectNameExists(name: string): boolean {
    return this.projects.some((project) => project.name === name);
  }

  /**
   * 检查项目名称是否可用
   * @param name 项目名称
   * @returns 如果项目名称可用，则返回true，否则返回false
   */
  public checkProjectName(name: string): boolean {
    return !this.isProjectNameExists(name);
  }

  /**
   * 将项目详细信息转换为基本信息
   * @param project 项目信息
   * @returns 项目基本信息
   */
  private toProjectBaseInfo(project: ProjectInfo): ProjectBaseInfo {
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      createdAt: project.createdAt,
    };
  }

  /**
   * 确保项目目录存在
   */
  private ensureProjectsDir(): void {
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }
  // #endregion

  // #region 数据集管理
  /**
   * 导入数据集
   * @param projectId 内存中项目ID
   * @param importOptions 数据集导入选项
   * @returns
   */
  public importData(
    projectId: string,
    importOptions: {
      file: File;
      datasetName: string;
      type: string; // 数据类型 flux aqi ...
      missingValueTypes: string[]; // 缺失值类型
      rows: number; // 行数
      columns: string[]; // 列名
    }
  ) {
    try {
      // 获取项目信息
      const projectIndex = this.projects.findIndex((p) => p.id === projectId);
      if (projectIndex == -1) {
        throw new Error(`找不到ID为 "${projectId}" 的项目`);
      }
      const project = this.projects[projectIndex];

      // 创建数据集ID和名称
      const datasetId = uuidv4();
      const datasetName = importOptions.datasetName;

      // 创建数据集目录
      const datasetPath = path.join(project.path, datasetName);
      if (!fs.existsSync(datasetPath)) {
        fs.mkdirSync(datasetPath, { recursive: true });
      }
      // 复制原始文件
      const originalExt = path.extname(importOptions.file.name);
      const originalFilePath = path.join(datasetPath, `original${originalExt}`);
      fs.copyFileSync(importOptions.file.path, originalFilePath);

      // 生成数据集元祖信息
      const metadata = {
        id: datasetId,
        name: datasetName,
        type: importOptions.type, // 数据类型 flux aqi ...
        createdAt: Date.now(),
        updatedAt: Date.now(),
        belongTo: projectId,
        dirPath: datasetPath, // 数据集目录
        missingValueTypes: [...importOptions.missingValueTypes],
        originalFile: {
          name: importOptions.file.name,
          filePath: originalFilePath,
          size: importOptions.file.size,
          rows: importOptions.rows,
          columns: importOptions.columns,
        },
        processedFiles: [],
      };
      this.saveDatasetConfig(metadata);
      const datasetBaseInfo: DatasetBaseInfo = this.toDatasetBaseInfo(metadata);

      if (!project.datasets) {
        project.datasets = [];
      }
      project.datasets.push(datasetBaseInfo);
      project.lastUpdated = Date.now();
      this.saveProjectConfig(project);
      this.saveProjectsIndex();
      return {
        datasetId,
        datasetName,
        path: datasetPath,
      };
    } catch (err) {
      console.error("Failed to import data:", err);
      throw err;
    }
  }

  // 删除数据集
  public deleteDataset(projectId: string, datasetId: string): boolean {
    const projectIndex = this.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      throw new Error(`找不到ID为 "${projectId}" 的项目`);
    }

    const project = this.projects[projectIndex];
    const datasetIndex = project.datasets.findIndex((d) => d.id === datasetId);

    if (datasetIndex === -1) {
      throw new Error(`找不到ID为 "${datasetId}" 的数据集`);
    }

    const dataset = project.datasets[datasetIndex];

    // 删除数据集目录
    const datasetDirPath = path.join(project.path, dataset.dirPath);
    if (fs.existsSync(datasetDirPath)) {
      fs.rmSync(datasetDirPath, { recursive: true, force: true });
    }

    // 从项目中移除数据集
    project.datasets.splice(datasetIndex, 1);

    // 更新项目的最后更新时间
    project.lastUpdated = Date.now();

    // 保存项目配置
    this.saveProjectConfig(project);

    return true;
  }

  // 更新数据集信息
  public updateDatasetInfo(
    projectId: string,
    datasetId: string,
    updates: Partial<DatasetInfo>
  ): DatasetInfo | null {
    // 获取数据集完整信息
    const datasetInfo = this.getDatasetInfo(projectId, datasetId);
    if (!datasetInfo) {
      return null;
    }

    // 更新数据集信息
    const updatedDataset: DatasetInfo = {
      ...datasetInfo,
      ...updates,
      id: datasetInfo.id, // 确保ID不变
      belongTo: projectId, // 确保所属项目不变
      updatedAt: Date.now(),
    };

    // 保存更新后的数据集元数据
    this.saveDatasetConfig(updatedDataset);

    // 更新项目中的数据集基本信息
    const project = this.getProject(projectId);
    if (project) {
      const datasetIndex = project.datasets.findIndex(
        (d) => d.id === datasetId
      );
      if (datasetIndex !== -1) {
        // 更新数据集基本信息
        project.datasets[datasetIndex] = this.toDatasetBaseInfo(updatedDataset);

        // 更新项目的最后更新时间
        project.lastUpdated = Date.now();

        // 保存项目配置
        this.saveProjectConfig(project);
      }
    }

    return updatedDataset;
  }

  // 获取项目的所有数据集完整信息
  public getProjectDatasets(projectId: string): DatasetInfo[] {
    const project = this.getProject(projectId);
    if (!project) {
      return [];
    }

    const datasets: DatasetInfo[] = [];

    for (const datasetBaseInfo of project.datasets) {
      const datasetInfo = this.loadDatasetInfo(projectId, datasetBaseInfo);
      if (datasetInfo) {
        datasets.push(datasetInfo);
      }
    }

    return datasets;
  }

  // 获取单个数据集的完整信息
  public getDatasetInfo(
    projectId: string,
    datasetId: string
  ): DatasetInfo | null {
    const project = this.getProject(projectId);
    if (!project) {
      return null;
    }

    const datasetBaseInfo = project.datasets.find((d) => d.id === datasetId);
    if (!datasetBaseInfo) {
      return null;
    }

    return this.loadDatasetInfo(projectId, datasetBaseInfo);
  }

  /**
   * 将 DatasetInfo 转换为 DatasetBaseInfo
   */
  private toDatasetBaseInfo(dataset: DatasetInfo): DatasetBaseInfo {
    return {
      id: dataset.id,
      name: dataset.name,
      type: dataset.type,
      dirPath: path.relative(this.projectsDir, dataset.dirPath), // 使用相对路径
      originalFile: path.basename(dataset.originalFile.filePath),
      createdAt: dataset.createdAt,
    };
  }

  /**
   * 保存数据集配置文件
   * @param dataset 数据集信息
   */
  private saveDatasetConfig(dataset: DatasetInfo): void {
    try {
      const metadataPath = path.join(dataset.dirPath, "metadata.json");
      fs.writeFileSync(metadataPath, JSON.stringify(dataset, null, 2), "utf-8");
    } catch (err) {
      console.error(`Failed to save dataset config for ${dataset.name}:`, err);
    }
  }

  // 加载数据集的完整信息
  private loadDatasetInfo(
    projectId: string,
    datasetBaseInfo: DatasetBaseInfo
  ): DatasetInfo | null {
    try {
      const project = this.getProject(projectId);
      if (!project) {
        return null;
      }

      const datasetDirPath = path.join(project.path, datasetBaseInfo.dirPath);
      const metadataPath = path.join(datasetDirPath, "metadata.json");

      if (!fs.existsSync(metadataPath)) {
        return null;
      }

      const metadataContent = fs.readFileSync(metadataPath, "utf-8");
      return JSON.parse(metadataContent);
    } catch (err) {
      console.error(
        `Failed to load dataset info for ${datasetBaseInfo.name}:`,
        err
      );
      return null;
    }
  }

  // #endregion
}

// 导出类型定义
export type { ProjectInfo, ProjectBaseInfo, DatasetInfo, DatasetBaseInfo }; // 导出类型定义
