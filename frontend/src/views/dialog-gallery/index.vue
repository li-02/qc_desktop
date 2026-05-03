<script setup lang="ts">
import { Check, Leaf, Plus, X } from "@/components/icons/iconoir";

type DialogVariant = {
  id: string;
  name: string;
  source: string;
  tone: string;
  note: string;
  className: string;
};

const variants: DialogVariant[] = [
  {
    id: "eco-apple",
    name: "Eco Apple Sheet",
    source: "macOS sheet + 生态绿色",
    tone: "轻、安静、原生感强",
    note: "推荐用于当前项目：白底、柔和绿边框、标题区克制，适合高频短表单。",
    className: "eco-apple-dialog",
  },
  {
    id: "fluent",
    name: "Fluent Compact",
    source: "Microsoft desktop",
    tone: "清晰、商务、系统感",
    note: "标题和关闭按钮同层，信息层级很直接，适合偏后台的配置窗口。",
    className: "fluent-dialog",
  },
  {
    id: "linear",
    name: "Linear Light",
    source: "Linear / Atlassian",
    tone: "轻量、现代、工具感",
    note: "阴影更浅、分割更少，适合频繁出现的创建和编辑窗口。",
    className: "linear-dialog",
  },
  {
    id: "material",
    name: "Material Soft",
    source: "Google Material",
    tone: "圆润、亲和、移动端气质更强",
    note: "留白更大、圆角更明显，如果产品未来偏轻应用可参考。",
    className: "material-dialog",
  },
];
</script>

<template>
  <main class="dialog-gallery-page">
    <section class="gallery-header">
      <div>
        <p class="eyebrow">Dialog style gallery</p>
        <h1>创建工作流弹窗风格对比</h1>
        <p class="summary">同一份内容，不同桌面端产品的弹窗处理方式。当前推荐使用 Eco Apple Sheet。</p>
      </div>
      <div class="header-meta">
        <span>创建工作流</span>
        <span>短表单</span>
        <span>桌面端</span>
      </div>
    </section>

    <section class="variant-grid" aria-label="Dialog variants">
      <article v-for="variant in variants" :key="variant.id" class="variant-card">
        <div class="variant-title">
          <div>
            <h2>{{ variant.name }}</h2>
            <p>{{ variant.source }} / {{ variant.tone }}</p>
          </div>
          <span v-if="variant.id === 'eco-apple'" class="pick-badge">当前采用</span>
        </div>

        <div class="stage">
          <div class="fake-app">
            <div class="fake-sidebar"></div>
            <div class="fake-content">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div class="preview-backdrop">
            <section class="dialog-sample" :class="variant.className" aria-label="创建工作流样式预览">
              <header class="sample-header">
                <div class="sample-heading">
                  <div class="sample-icon">
                    <component :is="variant.id === 'eco-apple' ? Leaf : Plus" :size="20" stroke-width="1.8" />
                  </div>
                  <div>
                    <h3>创建工作流</h3>
                    <p>定义可复用的数据处理节点流程</p>
                  </div>
                </div>
                <button class="icon-button" aria-label="关闭">
                  <X :size="18" stroke-width="1.8" />
                </button>
              </header>

              <div class="sample-body">
                <label class="field">
                  <span><b>*</b> 名称</span>
                  <input placeholder="输入工作流名称" />
                </label>
                <label class="field">
                  <span>描述</span>
                  <textarea placeholder="可选描述"></textarea>
                </label>
              </div>

              <footer class="sample-footer">
                <button class="secondary">取消</button>
                <button class="primary">
                  <Check :size="15" stroke-width="1.9" />
                  <span>创建</span>
                </button>
              </footer>
            </section>
          </div>
        </div>

        <p class="variant-note">{{ variant.note }}</p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.dialog-gallery-page {
  min-height: 100%;
  padding: 34px;
  background:
    radial-gradient(circle at 14% 12%, rgba(209, 238, 217, 0.72), transparent 28%),
    linear-gradient(135deg, #f7faf7 0%, #eef7f0 48%, #f8fbf8 100%);
  color: #17251e;
}

.gallery-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  max-width: 1280px;
  margin: 0 auto 28px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2d7a57;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.gallery-header h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.2;
}

.summary {
  max-width: 620px;
  margin: 10px 0 0;
  color: #5f7068;
  font-size: 15px;
  line-height: 1.7;
}

.header-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-meta span,
.pick-badge {
  border: 1px solid rgba(159, 203, 174, 0.72);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #2f7152;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}

.variant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  max-width: 1280px;
  margin: 0 auto;
}

.variant-card {
  border: 1px solid rgba(188, 210, 196, 0.78);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 48px rgba(23, 55, 38, 0.1);
  overflow: hidden;
}

.variant-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
}

.variant-title h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.variant-title p {
  margin: 5px 0 0;
  color: #718177;
  font-size: 13px;
}

.stage {
  position: relative;
  min-height: 390px;
  margin: 0 18px;
  border: 1px solid rgba(206, 220, 211, 0.72);
  border-radius: 8px;
  background: #eef5f0;
  overflow: hidden;
}

.fake-app {
  display: grid;
  grid-template-columns: 150px 1fr;
  height: 100%;
  min-height: 390px;
  opacity: 0.75;
}

.fake-sidebar {
  background: linear-gradient(180deg, rgba(218, 239, 224, 0.88), rgba(244, 249, 245, 0.72));
  border-right: 1px solid rgba(184, 207, 192, 0.72);
}

.fake-content {
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 48px;
}

.fake-content span {
  display: block;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
}

.fake-content span:nth-child(2) {
  width: 74%;
}

.fake-content span:nth-child(3) {
  width: 48%;
}

.preview-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(47, 77, 60, 0.18);
  backdrop-filter: blur(3px);
}

.dialog-sample {
  width: min(520px, 100%);
  overflow: hidden;
  background: #ffffff;
  color: #17251e;
}

.sample-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.sample-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.sample-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
}

.sample-header h3 {
  margin: 0;
  font-size: 21px;
  line-height: 1.25;
}

.sample-header p {
  margin: 5px 0 0;
  color: #63746b;
  font-size: 13px;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: #7a8981;
  cursor: pointer;
}

.sample-body {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 12px;
  align-items: start;
  color: #293a31;
  font-size: 14px;
}

.field b {
  color: #e5484d;
}

.field input,
.field textarea {
  width: 100%;
  border: 1px solid #c7d8ce;
  border-radius: 8px;
  background: #ffffff;
  color: #17251e;
  font: inherit;
  outline: none;
}

.field input {
  height: 42px;
  padding: 0 13px;
}

.field textarea {
  min-height: 92px;
  resize: none;
  padding: 12px 13px;
}

.sample-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.sample-footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 96px;
  height: 40px;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.secondary {
  border: 1px solid #c9d9d0;
  background: #ffffff;
  color: #41564b;
}

.primary {
  border: 1px solid transparent;
  background: #1f6f4f;
  color: #ffffff;
}

.eco-apple-dialog {
  border: 1px solid rgba(184, 217, 196, 0.88);
  border-radius: 14px;
  box-shadow: 0 22px 58px rgba(31, 73, 50, 0.2);
}

.eco-apple-dialog .sample-header {
  padding: 26px 28px 20px;
}

.eco-apple-dialog .sample-icon {
  border: 1px solid rgba(161, 210, 181, 0.82);
  border-radius: 12px;
  background: rgba(220, 244, 226, 0.72);
  color: #176647;
}

.eco-apple-dialog .sample-body {
  padding: 24px 36px 26px 24px;
}

.eco-apple-dialog .sample-footer {
  padding: 18px 28px 24px;
}

.fluent-dialog {
  border: 1px solid #d7dfdc;
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(20, 35, 28, 0.18);
}

.fluent-dialog .sample-header,
.fluent-dialog .sample-body,
.fluent-dialog .sample-footer {
  padding: 20px 24px;
}

.fluent-dialog .sample-footer {
  border-top: 1px solid #e7eeea;
  background: #f7faf8;
}

.linear-dialog {
  border: 1px solid rgba(220, 226, 223, 0.95);
  border-radius: 10px;
  box-shadow: 0 12px 34px rgba(22, 31, 27, 0.14);
}

.linear-dialog .sample-header,
.linear-dialog .sample-body,
.linear-dialog .sample-footer {
  padding: 22px 26px;
}

.linear-dialog .sample-icon {
  border-radius: 9px;
  background: #f2f7f4;
  color: #2e6f52;
}

.material-dialog {
  border-radius: 24px;
  box-shadow: 0 18px 44px rgba(46, 61, 52, 0.18);
}

.material-dialog .sample-header,
.material-dialog .sample-body,
.material-dialog .sample-footer {
  padding: 26px 30px;
}

.material-dialog .sample-icon {
  border-radius: 14px;
  background: #dcefe2;
  color: #1e6b4c;
}

.variant-note {
  margin: 0;
  padding: 16px 20px 20px;
  color: #62746a;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .dialog-gallery-page {
    padding: 22px;
  }

  .gallery-header,
  .variant-grid {
    grid-template-columns: 1fr;
  }

  .gallery-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
