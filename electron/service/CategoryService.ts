import { CategoryDBRepository } from "../repository/CategoryDBRepository";
import { DatasetDBRepository } from "../repository/DatasetDBRepository";
import { Category, Dataset } from "@shared/types/database";
import * as fs from "fs";
import * as path from "path";
import { CategoryInfo, CreateCategoryRequest, ServiceResponse } from "@shared/types/projectInterface";

export class CategoryService {
  private categoryRepository: CategoryDBRepository;
  private datasetRepository: DatasetDBRepository;

  constructor(categoryRepository: CategoryDBRepository, datasetRepository: DatasetDBRepository) {
    this.categoryRepository = categoryRepository;
    this.datasetRepository = datasetRepository;
  }

  private parseSQLiteTimestampAsUTC(timestamp?: string | null): number {
    if (!timestamp) return NaN;
    try {
      const iso = String(timestamp).trim().replace(" ", "T") + "Z";
      const t = Date.parse(iso);
      if (!isNaN(t)) return t;
    } catch (e) {
      // fallback below
    }
    const fallback = Date.parse(String(timestamp));
    return isNaN(fallback) ? NaN : fallback;
  }

  async getAllCategories(): Promise<ServiceResponse<CategoryInfo[]>> {
    try {
      const categoriesResult = this.categoryRepository.getAllCategories();
      if (!categoriesResult.success) {
        return { success: false, error: categoriesResult.error };
      }

      const categories: CategoryInfo[] = [];
      for (const category of categoriesResult.data!) {
        const datasetsResult = this.datasetRepository.getDatasetsByCategoryId(category.id);
        const datasets = datasetsResult.success ? datasetsResult.data! : [];
        categories.push(this.mapCategoryToCategoryInfo(category, datasets));
      }

      return { success: true, data: categories };
    } catch (error: any) {
      return { success: false, error: `获取分类列表失败: ${error.message}` };
    }
  }

  async getCategoryById(categoryId: string): Promise<ServiceResponse<CategoryInfo>> {
    try {
      const id = parseInt(categoryId);
      if (isNaN(id)) {
        return { success: false, error: "无效的分类ID" };
      }

      const categoryResult = this.categoryRepository.getCategoryById(id);
      if (!categoryResult.success) {
        return { success: false, error: categoryResult.error };
      }

      const datasetsResult = this.datasetRepository.getDatasetsByCategoryId(id);
      const datasets = datasetsResult.success ? datasetsResult.data! : [];

      return { success: true, data: this.mapCategoryToCategoryInfo(categoryResult.data!, datasets) };
    } catch (error: any) {
      return { success: false, error: `获取分类详情失败: ${error.message}` };
    }
  }

  async createCategory(request: CreateCategoryRequest): Promise<ServiceResponse<CategoryInfo>> {
    try {
      if (!request.name) {
        return { success: false, error: "分类名称不能为空" };
      }

      const result = this.categoryRepository.createCategory({
        category_name: request.name,
        description: "",
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return this.getCategoryById(result.data!.toString());
    } catch (error: any) {
      return { success: false, error: `创建分类失败: ${error.message}` };
    }
  }

  async deleteCategory(categoryId: string): Promise<ServiceResponse<void>> {
    try {
      const id = parseInt(categoryId);
      if (isNaN(id)) {
        return { success: false, error: "无效的分类ID" };
      }

      const datasetsResult = this.datasetRepository.getDatasetsByCategoryId(id);
      if (datasetsResult.success && datasetsResult.data) {
        for (const dataset of datasetsResult.data) {
          await this.datasetRepository.deleteDataset(dataset.id);
        }
      }

      return this.categoryRepository.deleteCategory(id);
    } catch (error: any) {
      return { success: false, error: `删除分类失败: ${error.message}` };
    }
  }

  async batchDeleteCategories(categoryIds: string[]): Promise<ServiceResponse<void>> {
    try {
      const ids = categoryIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return { success: true };
      }

      for (const id of ids) {
        const datasetsResult = this.datasetRepository.getDatasetsByCategoryId(id);
        if (datasetsResult.success && datasetsResult.data) {
          for (const dataset of datasetsResult.data) {
            await this.datasetRepository.deleteDataset(dataset.id);
          }
        }
      }

      return this.categoryRepository.batchDeleteCategories(ids);
    } catch (error: any) {
      return { success: false, error: `批量删除分类失败: ${error.message}` };
    }
  }

  async updateCategory(
    categoryId: string,
    updates: Partial<{ name: string }>
  ): Promise<ServiceResponse<CategoryInfo>> {
    try {
      const id = parseInt(categoryId);
      if (isNaN(id)) {
        return { success: false, error: "无效的分类ID" };
      }

      const updateData: any = {};
      if (updates.name) updateData.category_name = updates.name;

      const updateResult = this.categoryRepository.updateCategory(id, updateData);
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      return this.getCategoryById(categoryId);
    } catch (error: any) {
      return { success: false, error: `更新分类失败: ${error.message}` };
    }
  }

  async checkCategoryNameAvailable(name: string): Promise<ServiceResponse<boolean>> {
    try {
      const allCategoriesResult = await this.getAllCategories();
      if (!allCategoriesResult.success) {
        return { success: false, error: allCategoriesResult.error };
      }
      const nameExists = allCategoriesResult.data!.some(
        c => c.name.toLowerCase() === name.toLowerCase()
      );
      return { success: true, data: !nameExists };
    } catch (error: any) {
      return { success: false, error: `检查分类名称失败: ${error.message}` };
    }
  }

  private mapCategoryToCategoryInfo(category: Category, datasets: Dataset[]): CategoryInfo {
    return {
      id: category.id.toString(),
      name: category.category_name,
      path: "",
      createdAt: this.parseSQLiteTimestampAsUTC(category.created_at),
      lastUpdated: this.parseSQLiteTimestampAsUTC(category.updated_at),
      datasets: datasets.map(d => {
        let versionCount = 0;
        try {
          const versionsRes = this.datasetRepository.getVersionsByDatasetId(d.id);
          if (versionsRes.success && Array.isArray(versionsRes.data)) {
            versionCount = versionsRes.data.length;
          }
        } catch {
          versionCount = 0;
        }

        return {
          ...((): {
            dirPath: string;
            fileCount: number;
            totalSizeBytes: number;
            originalFileSizeBytes: number;
          } => {
            const sourceFilePath = d.source_file_path || "";
            const dirPath = sourceFilePath ? path.dirname(sourceFilePath) : "";
            let fileCount = 0;
            let totalSizeBytes = 0;
            let originalFileSizeBytes = 0;

            try {
              if (sourceFilePath && fs.existsSync(sourceFilePath)) {
                originalFileSizeBytes = fs.statSync(sourceFilePath).size;
              }
            } catch {
              originalFileSizeBytes = 0;
            }

            try {
              const allowedExts = new Set([".csv", ".xlsx", ".xls"]);
              if (dirPath && fs.existsSync(dirPath)) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                  if (!entry.isFile() || entry.name.startsWith(".")) continue;
                  const ext = path.extname(entry.name).toLowerCase();
                  if (!allowedExts.has(ext)) continue;
                  try {
                    totalSizeBytes += fs.statSync(path.join(dirPath, entry.name)).size;
                    fileCount += 1;
                  } catch {}
                }
              } else if (sourceFilePath && fs.existsSync(sourceFilePath)) {
                fileCount = 1;
                totalSizeBytes = originalFileSizeBytes;
              }
            } catch {}

            return { dirPath, fileCount, totalSizeBytes, originalFileSizeBytes };
          })(),
          id: d.id.toString(),
          name: d.dataset_name,
          type: "csv",
          originalFile: d.source_file_path || "",
          createdAt: this.parseSQLiteTimestampAsUTC(d.import_time),
          belongTo: category.id.toString(),
          versionCount,
        } as any;
      }),
    };
  }
}
