// project.ts - 使用类实现

import * as fs from 'fs';
import * as path from 'path';

interface ProjectInfo {
    id: string;
    name: string;
    path: string;
    createdAt: number;
    siteInfo: {
        longitude: string;
        latitude: string;
        altitude: string;
    }
}

interface ProjectIndex {
    lastUpdated: number;
    projects: ProjectInfo[];
}

export class ProjectManager {
    private projectsDir: string;
    private indexPath: string;
    private projectsIndex: ProjectIndex = {
        lastUpdated: 0,
        projects: []
    };

    constructor(projectsDir: string, indexPath: string) {
        this.projectsDir = projectsDir;
        this.indexPath = indexPath;
        this.ensureProjectsDir();
        this.loadProjectsIndex();
    }

    private ensureProjectsDir(): void {
        if (!fs.existsSync(this.projectsDir)) {
            fs.mkdirSync(this.projectsDir, {recursive: true});
        }
    }

    private loadProjectsIndex(): void {
        try {
            if (!fs.existsSync(this.indexPath)) {
                this.projectsIndex = {
                    lastUpdated: Date.now(),
                    projects: []
                };
                this.saveProjectsIndex();
                return;
            }

            const data = fs.readFileSync(this.indexPath, 'utf-8');
            this.projectsIndex = JSON.parse(data);

            this.projectsIndex.projects = this.projectsIndex.projects.filter(project => {
                return fs.existsSync(project.path);
            });

            this.saveProjectsIndex();
        } catch (err) {
            console.error("Failed to load projects index:", err);
            this.projectsIndex = {
                lastUpdated: Date.now(),
                projects: []
            };
            this.saveProjectsIndex();
        }
    }

    private saveProjectsIndex(): void {
        try {
            this.projectsIndex.lastUpdated = Date.now();
            fs.writeFileSync(this.indexPath, JSON.stringify(this.projectsIndex, null, 2), 'utf-8');
        } catch (err) {
            console.error("Failed to save projects index:", err);
        }
    }

    public getProjects(): ProjectInfo[] {
        return this.projectsIndex.projects;
    }

    public isProjectNameExists(name: string): boolean {
        return this.projectsIndex.projects.some(project => project.name === name);
    }

    public checkProjectName(name: string): boolean {
        return !this.isProjectNameExists(name);
    }

    public createProject(projectInfo: {
        name: string,
        siteInfo: { longitude: string, latitude: string, altitude: string }
    }): ProjectInfo {
        try {
            if (this.isProjectNameExists(projectInfo.name)) {
                throw new Error(`项目名称 "${projectInfo.name}" 已存在`);
            }

            const projectId = `${projectInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
            const projectPath = path.join(this.projectsDir, projectInfo.name);

            fs.mkdirSync(projectPath, {recursive: true});

            const config = {
                name: projectInfo.name,
                createdAt: Date.now(),
                siteInfo: projectInfo.siteInfo
            };

            fs.writeFileSync(
                path.join(projectPath, 'project.json'),
                JSON.stringify(config, null, 2),
                'utf-8'
            );

            const newProject: ProjectInfo = {
                id: projectId,
                name: projectInfo.name,
                path: projectPath,
                createdAt: config.createdAt,
                siteInfo: projectInfo.siteInfo,
            };

            this.projectsIndex.projects.push(newProject);
            this.saveProjectsIndex();

            return newProject;
        } catch (err) {
            console.error("Failed to create project:", err);
            throw err;
        }
    }

    public deleteProject(projectId: string): boolean {
        try {
            const projectIndex = this.projectsIndex.projects.findIndex(p => p.id === projectId);

            if (projectIndex === -1) {
                throw new Error(`找不到ID为 "${projectId}" 的项目`);
            }

            const project = this.projectsIndex.projects[projectIndex];

            if (fs.existsSync(project.path)) {
                fs.rmSync(project.path, {recursive: true, force: true});
            }

            this.projectsIndex.projects.splice(projectIndex, 1);
            this.saveProjectsIndex();

            return true;
        } catch (err) {
            console.error('Failed to delete project:', err);
            throw err;
        }
    }

    public importData(projectId: string, dataInfo: any) {
        console.log('import_data');
    }
}

// 导出类
export type {ProjectInfo}; // 导出类型定义