<script setup lang="ts">
import { computed } from "vue";
import { Check } from "lucide-vue-next";
import type { DatasetVersionInfo } from "@shared/types/projectInterface";
import { getStageLabel } from "@/utils/versionUtils";

const props = defineProps<{
  versions: DatasetVersionInfo[];
}>();

/**
 * Workflow stages in order.
 * Each version's stageType maps to one of these.
 */
const STAGE_ORDER = ["RAW", "FILTERED", "QC", "PARTITIONED"] as const;

const stageLabels: Record<string, string> = {
  RAW: "数据导入",
  FILTERED: "异常值检测",
  QC: "缺失值插补",
  PARTITIONED: "通量分割",
};

type StepStatus = "completed" | "in-progress" | "pending";

interface StepItem {
  key: string;
  label: string;
  status: StepStatus;
}

const steps = computed<StepItem[]>(() => {
  // Collect which stages are present
  const completedStages = new Set(props.versions.map(v => v.stageType));

  let foundFirst = false;
  return STAGE_ORDER.map(stage => {
    const done = completedStages.has(stage);
    let status: StepStatus;
    if (done) {
      status = "completed";
      foundFirst = true;
    } else if (foundFirst || (!foundFirst && stage === STAGE_ORDER[0])) {
      // First un-done stage after completed ones
      if (!foundFirst) {
        status = "pending";
      } else {
        status = "in-progress";
        foundFirst = false; // only one in-progress
      }
    } else {
      status = "pending";
    }
    return { key: stage, label: stageLabels[stage] || getStageLabel(stage), status };
  });
});

// Re-compute to ensure only ONE in-progress
const normalizedSteps = computed<StepItem[]>(() => {
  const raw = steps.value;
  let inProgressSet = false;
  return raw.map(s => {
    if (s.status === "completed") return s;
    if (!inProgressSet) {
      inProgressSet = true;
      return { ...s, status: "in-progress" as StepStatus };
    }
    return { ...s, status: "pending" as StepStatus };
  });
});
</script>

<template>
  <div class="stepper-card">
    <div class="card-header">
      <span class="card-title">处理进度</span>
    </div>
    <div class="card-body">
      <div class="stepper">
        <div v-for="step in normalizedSteps" :key="step.key" class="step" :class="step.status">
          <div class="step-indicator">
            <Check v-if="step.status === 'completed'" :size="12" />
          </div>
          <div class="step-content">
            <span class="step-title">{{ step.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stepper-card {
  background: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.card-header {
  padding: var(--space-2-5) var(--space-3);
  border-bottom: 1px solid var(--c-border);
}

.card-title {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--c-text-primary);
}

.card-body {
  padding: var(--space-4) var(--space-3) var(--space-4) var(--space-4);
  flex: 1;
}

/* Stepper */
.stepper {
  display: flex;
  flex-direction: column;
}

.step {
  display: flex;
  position: relative;
  padding-bottom: 20px;
}

.step:last-child {
  padding-bottom: 0;
}

/* Vertical line */
.step::before {
  content: "";
  position: absolute;
  left: 9px;
  top: 20px;
  bottom: -4px;
  width: 2px;
  background: var(--color-neutral-200);
  z-index: 1;
}

.step:last-child::before {
  display: none;
}

.step.completed::before {
  background: var(--color-primary-500);
}

.step.in-progress::before {
  background: repeating-linear-gradient(
    to bottom,
    var(--color-neutral-300) 0,
    var(--color-neutral-300) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Indicator */
.step-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  position: relative;
  flex-shrink: 0;
}

.step.completed .step-indicator {
  background: var(--color-primary-500);
  color: white;
}

.step.in-progress .step-indicator {
  background: var(--color-blue-600);
  box-shadow: 0 0 0 4px var(--color-blue-100);
  animation: pulse 2s infinite;
}

.step.in-progress .step-indicator::after {
  content: "";
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
}

.step.pending .step-indicator {
  background: var(--color-neutral-200);
  border: 2px solid var(--color-neutral-300);
}

/* Content */
.step-content {
  padding-left: var(--space-2-5);
  display: flex;
  align-items: center;
}

.step-title {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--c-text-base);
}

.step.pending .step-title {
  color: var(--c-text-disabled);
}

.step.in-progress .step-title {
  color: var(--color-blue-600);
  font-weight: var(--font-semibold);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(37, 99, 235, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
  }
}
</style>
