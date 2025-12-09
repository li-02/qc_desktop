import { DatabaseManager } from "../core/DatabaseManager";
import { Site } from "@shared/types/database";
import { ServiceResponse } from "@shared/types/projectInterface";

export class ProjectDBRepository {
  private get db() {
    return DatabaseManager.getInstance().getDatabase();
  }

  createProject(site: Omit<Site, 'id' | 'created_at' | 'updated_at' | 'is_del' | 'deleted_at'>): ServiceResponse<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sys_site (site_name, description, latitude, longitude, altitude)
        VALUES (@site_name, @description, @latitude, @longitude, @altitude)
      `);
      const info = stmt.run(site);
      return { success: true, data: Number(info.lastInsertRowid) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getAllProjects(): ServiceResponse<Site[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM sys_site ORDER BY updated_at DESC');
      const sites = stmt.all() as Site[];
      return { success: true, data: sites };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getProjectById(id: number): ServiceResponse<Site> {
    try {
      const stmt = this.db.prepare('SELECT * FROM sys_site WHERE id = ?');
      const site = stmt.get(id) as Site;
      if (!site) {
        return { success: false, error: 'Project not found' };
      }
      return { success: true, data: site };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  updateProject(id: number, site: Partial<Omit<Site, 'id' | 'created_at' | 'updated_at' | 'is_del' | 'deleted_at'>>): ServiceResponse<void> {
    try {
      const fields = Object.keys(site).map(key => `${key} = @${key}`).join(', ');
      if (!fields) return { success: true };

      const stmt = this.db.prepare(`
        UPDATE sys_site SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id
      `);
      stmt.run({ ...site, id });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteProject(id: number): ServiceResponse<void> {
    try {
      // Soft delete
      const stmt = this.db.prepare(`
        UPDATE sys_site 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  batchDeleteProjects(ids: number[]): ServiceResponse<void> {
    try {
      if (ids.length === 0) return { success: true };
      
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        UPDATE sys_site 
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP 
        WHERE id IN (${placeholders})
      `);
      stmt.run(...ids);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
