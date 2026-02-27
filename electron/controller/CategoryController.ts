import { BaseController } from "./BaseController";
import { IpcMainInvokeEvent } from "electron";
import { CategoryService } from "../service/CategoryService";
import { CreateCategoryRequest } from "@shared/types/projectInterface";

export class CategoryController extends BaseController {
  private categoryService: CategoryService;

  constructor(categoryService: CategoryService) {
    super();
    this.categoryService = categoryService;
  }

  async getCategories(args: void, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      const result = await this.categoryService.getAllCategories();
      if (!result.success) {
        throw new Error(result.error || "获取分类失败");
      }
      return result.data;
    });
  }

  async getCategoryById(args: { categoryId: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.categoryId || typeof args.categoryId !== "string") {
        throw new Error("分类ID不能为空");
      }
      const result = await this.categoryService.getCategoryById(args.categoryId);
      if (!result.success) {
        throw new Error(result.error || "获取分类失败");
      }
      return result.data;
    });
  }

  async createCategory(args: { name: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.name || typeof args.name !== "string" || args.name.trim().length === 0) {
        throw new Error("分类名称不能为空");
      }
      if (args.name.length > 50) {
        throw new Error("分类名称不能超过50个字符");
      }
      const request: CreateCategoryRequest = { name: args.name.trim() };
      const result = await this.categoryService.createCategory(request);
      if (!result.success) {
        throw new Error(result.error || "创建分类失败");
      }
      return { category: result.data };
    });
  }

  async updateCategory(args: { categoryId: string; updates: { name?: string } }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.categoryId || typeof args.categoryId !== "string") {
        throw new Error("分类ID不能为空");
      }
      if (!args.updates || Object.keys(args.updates).length === 0) {
        throw new Error("更新内容不能为空");
      }
      const cleanUpdates: { name?: string } = {};
      if (args.updates.name !== undefined) {
        if (typeof args.updates.name !== "string" || args.updates.name.trim().length === 0) {
          throw new Error("分类名称不能为空");
        }
        cleanUpdates.name = args.updates.name.trim();
      }
      const result = await this.categoryService.updateCategory(args.categoryId, cleanUpdates);
      if (!result.success) {
        throw new Error(result.error || "更新分类失败");
      }
      return { category: result.data };
    });
  }

  async deleteCategory(args: { categoryId: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.categoryId || typeof args.categoryId !== "string") {
        throw new Error("分类ID不能为空");
      }
      const result = await this.categoryService.deleteCategory(args.categoryId);
      if (!result.success) {
        throw new Error(result.error || "删除分类失败");
      }
      return {};
    });
  }

  async batchDeleteCategories(args: { categoryIds: string[] }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.categoryIds || !Array.isArray(args.categoryIds) || args.categoryIds.length === 0) {
        throw new Error("分类ID列表不能为空");
      }
      const result = await this.categoryService.batchDeleteCategories(args.categoryIds);
      if (!result.success) {
        throw new Error(result.error || "批量删除分类失败");
      }
      return {};
    });
  }

  async checkCategoryName(args: { name: string }, event: IpcMainInvokeEvent) {
    return this.handleAsync(async () => {
      if (!args.name || args.name.trim().length === 0) {
        throw new Error("分类名称不能为空");
      }
      const result = await this.categoryService.checkCategoryNameAvailable(args.name.trim());
      if (!result.success) {
        throw new Error(result.error || "检查分类名称失败");
      }
      return { isAvailable: result.data };
    });
  }
}
