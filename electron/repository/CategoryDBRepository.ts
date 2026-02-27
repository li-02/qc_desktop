import { DatabaseManager } from "../core/DatabaseManager";
import { Category } from "@shared/types/database";
import { ServiceResponse } from "@shared/types/projectInterface";

export class CategoryDBRepository {
  private get db() {
    return DatabaseManager.getInstance().getDatabase();
  }

  createCategory(category: Omit<Category, "id" | "created_at" | "updated_at" | "is_del" | "deleted_at">): ServiceResponse<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sys_category (category_name, description)
        VALUES (@category_name, @description)
      `);
      const info = stmt.run(category);
      return { success: true, data: Number(info.lastInsertRowid) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getAllCategories(): ServiceResponse<Category[]> {
    try {
      const stmt = this.db.prepare("SELECT * FROM sys_category WHERE is_del = 0 ORDER BY updated_at DESC");
      const categories = stmt.all() as Category[];
      return { success: true, data: categories };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getCategoryById(id: number): ServiceResponse<Category> {
    try {
      const stmt = this.db.prepare("SELECT * FROM sys_category WHERE id = ?");
      const category = stmt.get(id) as Category;
      if (!category) {
        return { success: false, error: "Category not found" };
      }
      return { success: true, data: category };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  updateCategory(
    id: number,
    category: Partial<Omit<Category, "id" | "created_at" | "updated_at" | "is_del" | "deleted_at">>
  ): ServiceResponse<void> {
    try {
      const fields = Object.keys(category)
        .map(key => `${key} = @${key}`)
        .join(", ");
      if (!fields) return { success: true };

      const stmt = this.db.prepare(`
        UPDATE sys_category SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id
      `);
      stmt.run({ ...category, id });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  deleteCategory(id: number): ServiceResponse<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE sys_category
        SET is_del = 1, deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  batchDeleteCategories(ids: number[]): ServiceResponse<void> {
    try {
      if (ids.length === 0) return { success: true };
      const placeholders = ids.map(() => "?").join(",");
      const stmt = this.db.prepare(`
        UPDATE sys_category
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
