<template>
  <button
    :disabled="disabled || loading"
    :class="[
      'relative group flex flex-col items-center gap-3 p-4 rounded-lg transition-all duration-200 text-center min-h-24',
      'hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2',
      buttonClasses,
      {
        'cursor-not-allowed opacity-50': disabled,
        'cursor-pointer': !disabled && !loading,
      },
    ]"
    @click="handleClick">
    <!-- 加载状态覆盖层 -->
    <div v-if="loading" class="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center z-10">
      <el-icon class="animate-spin text-xl text-gray-600">
        <Loading />
      </el-icon>
    </div>

    <!-- 徽章 -->
    <div
      v-if="badge && !loading"
      :class="[
        'absolute -top-2 -right-2 text-xs font-bold px-2 py-1 rounded-full min-w-5 h-5 flex items-center justify-center',
        badgeClasses,
      ]">
      {{ badge }}
    </div>

    <!-- 图标 -->
    <div :class="['text-2xl transition-transform group-hover:scale-110', iconClasses]">
      {{ icon }}
    </div>

    <!-- 标题和描述 -->
    <div class="flex-1">
      <div :class="['font-medium text-sm mb-1', titleClasses]">
        {{ title }}
      </div>
      <div :class="['text-xs opacity-75 leading-tight', descriptionClasses]">
        {{ description }}
      </div>
    </div>

    <!-- 状态指示器 -->
    <div v-if="showStatus" class="flex items-center gap-1 text-xs mt-1">
      <span :class="['w-2 h-2 rounded-full', statusIndicatorClass]"></span>
      <span :class="statusTextClass">{{ statusText }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Loading } from "@element-plus/icons-vue";

// Props
interface Props {
  icon: string;
  title: string;
  description: string;
  color?: "emerald" | "blue" | "purple" | "orange" | "gray" | "red";
  disabled?: boolean;
  loading?: boolean;
  badge?: string | number | null;
  badgeType?: "primary" | "success" | "warning" | "danger" | "info";
  status?: "idle" | "processing" | "completed" | "error";
  showStatus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  color: "emerald",
  disabled: false,
  loading: false,
  badge: null,
  badgeType: "primary",
  status: "idle",
  showStatus: false,
});

// Emits
const emit = defineEmits<{
  click: [];
}>();

// Computed properties
const buttonClasses = computed(() => {
  const colorMap = {
    emerald: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-emerald-200",
    blue: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-blue-200",
    purple: "bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500 shadow-purple-200",
    orange: "bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500 shadow-orange-200",
    gray: "bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 shadow-gray-200",
    red: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-red-200",
  };

  return `${colorMap[props.color]} shadow-md`;
});

const iconClasses = computed(() => {
  if (props.loading) return "opacity-30";
  return "drop-shadow-sm";
});

const titleClasses = computed(() => {
  if (props.loading) return "opacity-50";
  return "";
});

const descriptionClasses = computed(() => {
  if (props.loading) return "opacity-30";
  return "";
});

const badgeClasses = computed(() => {
  const typeMap = {
    primary: "bg-blue-500 text-white",
    success: "bg-emerald-500 text-white",
    warning: "bg-yellow-500 text-white",
    danger: "bg-red-500 text-white",
    info: "bg-gray-500 text-white",
  };

  return `${typeMap[props.badgeType]} shadow-sm`;
});

const statusIndicatorClass = computed(() => {
  const statusMap = {
    idle: "bg-gray-400",
    processing: "bg-yellow-400 animate-pulse",
    completed: "bg-emerald-400",
    error: "bg-red-400",
  };

  return statusMap[props.status];
});

const statusTextClass = computed(() => {
  const statusMap = {
    idle: "text-gray-500",
    processing: "text-yellow-600",
    completed: "text-emerald-600",
    error: "text-red-600",
  };

  return statusMap[props.status];
});

const statusText = computed(() => {
  const statusMap = {
    idle: "就绪",
    processing: "处理中",
    completed: "已完成",
    error: "失败",
  };

  return statusMap[props.status];
});

// Methods
const handleClick = () => {
  if (!props.disabled && !props.loading) {
    emit("click");
  }
};
</script>

<style scoped>
/* 按钮阴影动画 */
.group:hover {
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

/* 聚焦状态样式 */
.focus\:ring-2:focus {
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.2),
    0 0 0 4px currentColor;
}

/* 禁用状态过渡 */
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}

/* 徽章动画 */
@keyframes badge-appear {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 徽章进入动画 */
.absolute {
  animation: badge-appear 0.3s ease-out;
}

/* 图标悬停动画 */
.group:hover .group-hover\:scale-110 {
  transform: scale(1.1);
}

/* 加载状态背景模糊 */
.bg-white\/80 {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(2px);
}

/* 状态指示器呼吸动画 */
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .min-h-24 {
    min-height: 5rem;
  }

  .text-2xl {
    font-size: 1.25rem;
  }

  .p-4 {
    padding: 0.75rem;
  }
}
</style>
