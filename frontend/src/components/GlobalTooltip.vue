<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

const tooltipText = ref("");
const state = reactive({
  visible: false,
  top: 0,
  left: 0,
  placement: "top" as "top" | "bottom",
});

let activeElement: HTMLElement | null = null;
let showTimer: number | undefined;
let hideTimer: number | undefined;

const tooltipStyle = computed(() => ({
  top: `${state.top}px`,
  left: `${state.left}px`,
}));

function findTooltipElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>("[title], [data-qc-tooltip-title]");
  if (!element || element.closest(".qc-global-tooltip, .el-popper")) return null;
  return element;
}

function readTooltip(element: HTMLElement): string {
  const nativeTitle = element.getAttribute("title");
  if (nativeTitle) {
    element.dataset.qcTooltipTitle = nativeTitle;
    element.setAttribute("aria-label", nativeTitle);
    element.removeAttribute("title");
    return nativeTitle;
  }

  return element.dataset.qcTooltipTitle || "";
}

function updatePosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const gap = 8;
  const preferredTop = rect.top - gap;
  const useBottom = preferredTop < 32;

  state.left = rect.left + rect.width / 2;
  state.top = useBottom ? rect.bottom + gap : preferredTop;
  state.placement = useBottom ? "bottom" : "top";
}

function clearTimers() {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
}

function showTooltip(element: HTMLElement) {
  const text = readTooltip(element);
  if (!text.trim()) return;

  activeElement = element;
  tooltipText.value = text;
  updatePosition(element);
  clearTimers();
  showTimer = window.setTimeout(() => {
    state.visible = true;
  }, 120);
}

function hideTooltip() {
  clearTimers();
  hideTimer = window.setTimeout(() => {
    state.visible = false;
    activeElement = null;
  }, 80);
}

function handlePointerOver(event: PointerEvent) {
  const element = findTooltipElement(event.target);
  if (!element || element === activeElement) return;
  showTooltip(element);
}

function handlePointerMove() {
  if (!activeElement || !state.visible) return;
  updatePosition(activeElement);
}

function handlePointerOut(event: PointerEvent) {
  if (!activeElement) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && activeElement.contains(nextTarget)) return;
  hideTooltip();
}

function handleFocusIn(event: FocusEvent) {
  const element = findTooltipElement(event.target);
  if (element) showTooltip(element);
}

onMounted(() => {
  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("pointerout", handlePointerOut, true);
  document.addEventListener("focusin", handleFocusIn, true);
  document.addEventListener("focusout", hideTooltip, true);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
});

onUnmounted(() => {
  clearTimers();
  document.removeEventListener("pointerover", handlePointerOver, true);
  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("pointerout", handlePointerOut, true);
  document.removeEventListener("focusin", handleFocusIn, true);
  document.removeEventListener("focusout", hideTooltip, true);
  window.removeEventListener("scroll", hideTooltip, true);
  window.removeEventListener("resize", hideTooltip);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-show="state.visible"
      class="qc-global-tooltip"
      :class="`qc-global-tooltip--${state.placement}`"
      :style="tooltipStyle"
      role="tooltip">
      {{ tooltipText }}
    </div>
  </Teleport>
</template>

<style scoped>
.qc-global-tooltip {
  position: fixed;
  z-index: var(--z-top);
  max-width: min(320px, calc(100vw - 24px));
  padding: 6px 10px;
  border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-control);
  background: var(--c-bg-elevated);
  box-shadow: var(--shadow-lg);
  color: var(--c-text-base);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
  pointer-events: none;
  transform: translate(-50%, -100%);
  white-space: normal;
}

.qc-global-tooltip--bottom {
  transform: translate(-50%, 0);
}
</style>
