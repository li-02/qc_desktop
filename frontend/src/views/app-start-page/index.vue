<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Upload, ArrowDown } from '@element-plus/icons-vue';

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

const handleDownloadTemplate = () => {
  ElMessage({
    message: '正在下载模板...',
    type: 'info',
  });
  // 这里可以添加下载模板的逻辑
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
  <div class="w-full h-screen flex flex-col overflow-hidden font-[Arial]">
    <!-- 加载遮罩 -->
    <div v-if="isLoading" class="absolute top-0 left-0 w-full h-full bg-white/90 flex justify-center items-center z-50">
      <el-card class="w-60 rounded-lg shadow-lg">
        <div class="text-center">
          <el-progress type="circle" :percentage="100" :indeterminate="true" />
          <p class="mt-4 text-[#2c3e50]">正在加载应用...</p>
        </div>
      </el-card>
    </div>

    <div class="flex flex-col h-full w-full">
      <!-- 工具栏 -->
      <div class="h-10 bg-[#34495e] flex items-center px-2.5 shadow-sm z-10">
        <el-tooltip content="新建项目" placement="bottom">
          <el-button 
            type="primary" 
            :icon="Plus" 
            circle 
            class="mx-1.5 h-[30px] w-[30px] p-0 text-sm bg-[#3498db] border-[#3498db] hover:bg-[#2980b9] hover:border-[#2980b9]"
            @click="handleNewProject"
          />
        </el-tooltip>
        <el-tooltip content="打开项目" placement="bottom">
          <el-button 
            type="primary" 
            :icon="Upload" 
            circle 
            class="mx-1.5 h-[30px] w-[30px] p-0 text-sm bg-[#3498db] border-[#3498db] hover:bg-[#2980b9] hover:border-[#2980b9]"
            @click="handleOpenProject"
          />
        </el-tooltip>
        <el-tooltip content="下载模板" placement="bottom">
          <el-button 
            type="primary" 
            :icon="ArrowDown" 
            circle 
            class="mx-1.5 h-[30px] w-[30px] p-0 text-sm bg-[#3498db] border-[#3498db] hover:bg-[#2980b9] hover:border-[#2980b9]"
            @click="handleDownloadTemplate"
          />
        </el-tooltip>
      </div>

      <!-- 主要内容区域 -->
      <div class="flex-1 bg-[#f5f7fa] flex flex-col items-center py-7 px-5 overflow-y-auto">
        <!-- 欢迎标题 -->
        <div class="text-center mb-10 animate-[fadeIn_0.8s_ease-out]">
          <h1 class="text-3xl font-bold text-[#2c3e50] mb-2.5">欢迎使用生态数据质量控制与分析应用</h1>
          <p class="text-base text-[#7f8c8d]">开始一个新项目或打开已有项目</p>
        </div>

        <!-- 操作卡片区域 -->
        <div class="flex justify-center gap-x-8 w-full max-w-[900px] mb-10 animate-[slideUp_0.8s_ease-out]">
          <!-- 新建项目卡片 -->

            <el-card 
            class="w-[220px] cursor-pointer transition-all duration-300 border border-[#e0e0e0] rounded-md overflow-hidden hover:translate-y-[-5px] hover:shadow-lg" 
            @click="handleNewProject"
          >
            <template #header>
              <div class="h-20 flex items-center justify-center -mx-5 -mt-5 text-white bg-[#3498db]">
                <h2 class="text-lg">新建项目</h2>
              </div>
            </template>
            <div class="flex flex-col items-center py-4">
              <div class="w-[60px] h-[60px] rounded-full bg-[#ecf0f1] flex items-center justify-center mb-4">
                <el-icon class="text-[24px] text-[#3498db]"><Plus /></el-icon>
              </div>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">创建新的生态监测项目</p>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">建立项目配置和参数</p>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">导入生态监测数据</p>
            </div>
          </el-card>
    


          <!-- 打开项目卡片 -->
 
            <el-card 
            class="w-[220px] cursor-pointer transition-all duration-300 border border-[#e0e0e0] rounded-md overflow-hidden hover:translate-y-[-5px] hover:shadow-lg" 
            @click="handleOpenProject"
          >
            <template #header>
              <div class="h-20 flex items-center justify-center -mx-5 -mt-5 text-white bg-[#2ecc71]">
                <h2 class="text-lg">打开项目</h2>
              </div>
            </template>
            <div class="flex flex-col items-center py-4">
              <div class="w-[60px] h-[60px] rounded-full bg-[#ecf0f1] flex items-center justify-center mb-4">
                <el-icon class="text-[24px] text-[#2ecc71]"><Upload /></el-icon>
              </div>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">打开已有的监测项目</p>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">继续之前的分析工作</p>
              <p class="text-sm text-[#7f8c8d] text-center my-0.5">查看已有的报告和结果</p>
            </div>
          </el-card>


        </div>

        <!-- 最近项目区域 -->
        <div class="w-full max-w-[600px] animate-[fadeInDelay_0.8s_ease-out_0.3s_backwards]">
          <h2 class="text-lg font-bold text-[#2c3e50] text-center mb-4">最近项目</h2>
          
          <el-card class="rounded-md overflow-hidden">
            <el-table 
              :data="recentProjects" 
              style="width: 100%" 
              :stripe="true" 
              :show-header="false"
              @row-click="handleOpenRecentProject"
            >
              <el-table-column prop="name" label="项目名称">
                <template #default="scope">
                  <span class="text-[#2c3e50] text-sm">{{ scope.row.name }}</span>
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

      <!-- 底部状态栏 -->
      <!-- <div class="h-5 bg-[#2c3e50] text-[#ecf0f1] text-[11px] px-2.5 flex items-center">
        <span>就绪 | 版本: {{ appVersion }} | 用户: {{ userName }}</span>
      </div> -->
    </div>
  </div>
</template>

<style>
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

@keyframes fadeInDelay {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 响应式样式 */
@media (max-width: 768px) {
  .flex.justify-center.gap-8 {
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }
  
  .w-\[220px\] {
    width: 90%;
    max-width: 280px;
  }
  
  .text-3xl {
    font-size: 1.5rem;
  }
  
  .text-base {
    font-size: 0.875rem;
  }
}
</style>