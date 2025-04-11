<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus as ElIconPlus, Upload as ElIconUpload } from '@element-plus/icons-vue';

// 类型定义
interface RecentProject {
  name: string;
  date: string;
}

// 应用状态
const isLoading = ref(true);
const appVersion = ref('1.0.0');
const userName = ref('生态研究员');

// 模拟最近项目数据
const recentProjects = ref<RecentProject[]>([
  { name: '湿地生态监测项目', date: '2023-03-15' },
  { name: '森林生态系统监测', date: '2023-02-28' },
  { name: '高山草甸监测项目', date: '2023-01-15' },
  { name: '沙漠生态监测', date: '2022-12-10' },
]);

// 事件处理函数
const handleNewProject = () => {
  ElMessage({
    message: '正在创建新项目...',
    type: 'info',
  });
  // 这里可以添加创建新项目的逻辑
};

const handleOpenProject = () => {
  ElMessage({
    message: '请选择要打开的项目...',
    type: 'info',
  });
  // 这里可以添加打开项目的逻辑
};

const handleOpenRecentProject = (project: RecentProject) => {
  ElMessage({
    message: `正在打开项目: ${project.name}`,
    type: 'success',
  });
  // 这里可以添加打开特定项目的逻辑
};

// 生命周期钩子
onMounted(() => {
  // 模拟加载过程
  setTimeout(() => {
    isLoading.value = false;
  }, 800);
});
</script>

<template>
  <div class="app-start-page">
    <!-- 加载遮罩 -->
    <div v-if="isLoading" class="loading-overlay">
      <el-card class="loading-card">
        <div class="text-center">
          <el-progress type="circle" :percentage="100" :indeterminate="true" />
          <p class="mt-4 text-[#2c3e50]">正在加载应用...</p>
        </div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar h-[40px] bg-[#34495e] flex items-center px-2 shadow-sm">
      <el-tooltip content="新建项目" placement="bottom" :visible-arrow="false">
        <el-button type="primary" size="small" class="mx-1 h-[30px] w-[30px] p-0 flex items-center justify-center"
                  @click="handleNewProject">
          <span class="text-xl font-bold">+</span>
        </el-button>
      </el-tooltip>
      <el-tooltip content="打开项目" placement="bottom" :visible-arrow="false">
        <el-button type="primary" size="small" class="mx-1 h-[30px] w-[30px] p-0 flex items-center justify-center"
                  @click="handleOpenProject">
          <span class="text-xl">↑</span>
        </el-button>
      </el-tooltip>
      <el-tooltip content="下载模板" placement="bottom" :visible-arrow="false">
        <el-button type="primary" size="small" class="mx-1 h-[30px] w-[30px] p-0 flex items-center justify-center">
          <span class="text-xl">↓</span>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 主要内容区域 -->
    <div class="content-area bg-[#f5f7fa] p-4 flex-1 flex flex-col items-center overflow-auto">
      <!-- 欢迎标题 -->
      <div class="welcome-title text-center my-6 md:my-10 animate-fade-in">
        <h1 class="text-2xl md:text-3xl font-bold text-[#2c3e50]">欢迎使用生态数据质量控制与分析应用</h1>
        <p class="text-sm md:text-base text-[#7f8c8d] mt-2">开始一个新项目或打开已有项目</p>
      </div>

      <!-- 操作卡片区域 -->
      <div class="action-cards flex flex-col md:flex-row justify-center md:gap-8 my-4 md:my-6 w-full px-4 animate-slide-up">
        <!-- 新建项目卡片 -->
        <el-card class="card w-full md:w-[220px] mb-4 md:mb-0 cursor-pointer hover:shadow-md transition-all duration-300"
                @click="handleNewProject">
          <template #header>
            <div class="h-[60px] md:h-[80px] bg-[#3498db] flex items-center justify-center -mx-5 -mt-5 text-white">
              <h2 class="text-lg font-medium">新建项目</h2>
            </div>
          </template>
          <div class="card-content flex flex-col items-center p-2">
            <div class="icon-circle w-[60px] h-[60px] rounded-full bg-[#ecf0f1] flex items-center justify-center mb-4">
              <el-icon class="text-[32px] text-[#3498db]"><el-icon-plus /></el-icon>
            </div>
            <p class="text-xs md:text-sm text-[#7f8c8d] text-center">建立项目配置和参数</p>
            <p class="text-xs md:text-sm text-[#7f8c8d] text-center">导入生态监测数据</p>
          </div>
        </el-card>

        <!-- 打开项目卡片 -->
        <el-card class="card w-full md:w-[220px] cursor-pointer hover:shadow-md transition-all duration-300"
                @click="handleOpenProject">
          <template #header>
            <div class="h-[60px] md:h-[80px] bg-[#2ecc71] flex items-center justify-center -mx-5 -mt-5 text-white">
              <h2 class="text-lg font-medium">打开项目</h2>
            </div>
          </template>
          <div class="card-content flex flex-col items-center p-2">
            <div class="icon-circle w-[60px] h-[60px] rounded-full bg-[#ecf0f1] flex items-center justify-center mb-4">
              <el-icon class="text-[32px] text-[#2ecc71]"><el-icon-upload /></el-icon>
            </div>
            <p class="text-xs md:text-sm text-[#7f8c8d] text-center">打开已有的监测项目</p>
            <p class="text-xs md:text-sm text-[#7f8c8d] text-center">继续之前的分析工作</p>
            <p class="text-xs md:text-sm text-[#7f8c8d] text-center">查看已有的报告和结果</p>
          </div>
        </el-card>
      </div>

      <!-- 最近项目区域 -->
      <div class="recent-projects w-full max-w-[600px] mt-4 animate-fade-in-delay">
        <h2 class="text-lg font-bold text-[#2c3e50] text-center mb-4">最近项目</h2>
        
        <el-card class="project-list overflow-hidden">
          <el-table 
            :data="recentProjects" 
            style="width: 100%" 
            :stripe="true" 
            :show-header="false"
            @row-click="handleOpenRecentProject">
            <el-table-column prop="name" label="项目名称">
              <template #default="scope">
                <span class="text-[#2c3e50]">{{ scope.row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="date" label="日期" width="120" align="right">
              <template #default="scope">
                <span class="text-[#95a5a6] text-sm">{{ scope.row.date }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-start-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: #ffffff;
  overflow: hidden;
}

/* 加载遮罩层样式 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-card {
  width: 240px;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 动画效果 */
.animate-fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.animate-slide-up {
  animation: slideUp 0.6s ease-out;
}

.animate-fade-in-delay {
  animation: fadeIn 0.8s ease-in-out;
  animation-delay: 0.2s;
  opacity: 0;
  animation-fill-mode: forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

/* 卡片样式 */
.card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  transform: translateY(-4px);
}

/* 自定义Element Plus组件样式 */
:deep(.el-card__header) {
  padding: 0;
}

:deep(.el-card__body) {
  padding: 15px;
}

:deep(.el-table) {
  --el-table-border-color: #e0e0e0;
  --el-table-header-bg-color: #f5f7fa;
  --el-table-row-hover-bg-color: #f0f2f5;
}

:deep(.el-table__row) {
  cursor: pointer;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background-color: #f5f7fa;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .content-area {
    padding: 0.5rem;
  }
  
  .welcome-title {
    margin: 1rem 0;
  }
  
  .action-cards {
    flex-direction: column;
    align-items: center;
  }
  
  .card {
    width: 90%;
    margin-bottom: 1rem;
  }
}
</style>