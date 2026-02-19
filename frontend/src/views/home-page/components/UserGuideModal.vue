<script setup lang="ts">
import { ref, computed } from "vue";
import {
  FolderAdd,
  Document,
  DataAnalysis,
  Connection,
  Warning,
  MagicStick,
  TrendCharts,
  Download,
  ArrowRight,
  Close,
  Check,
  QuestionFilled,
} from "@element-plus/icons-vue";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();
const visible = computed({
  get: () => props.modelValue,
  set: val => emit("update:modelValue", val),
});
const activeSection = ref("start");
const sections = [
  { id: "start", label: "快速开始", icon: "start" },
  { id: "project", label: "项目与数据集", icon: "project" },
  { id: "overview", label: "数据视图", icon: "overview" },
  { id: "correlation", label: "相关性分析", icon: "correlation" },
  { id: "outlier", label: "异常值检测", icon: "outlier" },
  { id: "gapfill", label: "缺失值插补", icon: "gapfill" },
  { id: "flux", label: "通量分割", icon: "flux" },
  { id: "export", label: "导出数据", icon: "export" },
];
const scrollTo = (id: string) => {
  activeSection.value = id;
  const el = document.getElementById(`gs-${id}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};
</script>

<template>
  <el-dialog
    v-model="visible"
    title=""
    :width="900"
    :show-close="false"
    class="user-guide-dialog"
    append-to-body
    destroy-on-close>
    <template #header>
      <div class="g-header">
        <div class="g-header-left">
          <div class="g-header-icon">
            <el-icon><QuestionFilled /></el-icon>
          </div>
          <div>
            <div class="g-header-title">使用指南</div>
            <div class="g-header-sub">生态监测桌面端 · 操作说明文档</div>
          </div>
        </div>
        <button class="g-close-btn" @click="visible = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </template>

    <div class="g-body">
      <!-- 左侧导航 -->
      <nav class="g-nav">
        <div class="g-nav-label">目录</div>
        <button
          v-for="s in sections"
          :key="s.id"
          class="g-nav-item"
          :class="{ active: activeSection === s.id }"
          @click="scrollTo(s.id)">
          <el-icon class="n-icon">
            <FolderAdd v-if="s.icon === 'start'" />
            <Document v-else-if="s.icon === 'project'" />
            <DataAnalysis v-else-if="s.icon === 'overview'" />
            <Connection v-else-if="s.icon === 'correlation'" />
            <Warning v-else-if="s.icon === 'outlier'" />
            <MagicStick v-else-if="s.icon === 'gapfill'" />
            <TrendCharts v-else-if="s.icon === 'flux'" />
            <Download v-else-if="s.icon === 'export'" />
          </el-icon>
          <span>{{ s.label }}</span>
          <el-icon class="n-arrow"><ArrowRight /></el-icon>
        </button>
      </nav>

      <!-- 右侧内容 -->
      <div class="g-content">
        <!-- § 快速开始 -->
        <section id="gs-start" class="g-sec">
          <div class="sec-tag">快速开始</div>
          <h2 class="sec-h">三步开始数据分析</h2>
          <p class="sec-p">欢迎使用生态监测桌面端！按照以下步骤快速完成第一次数据处理。</p>
          <div class="steps">
            <div class="step-row">
              <div class="step-num">1</div>
              <div class="step-body">
                <div class="step-title">创建站点</div>
                <div class="step-desc">
                  点击左侧「项目管理」区域的 <kbd>+</kbd> 按钮，填写站点名称和地理坐标（经度、纬度、海拔）。
                </div>
              </div>
            </div>
            <div class="step-conn"></div>
            <div class="step-row">
              <div class="step-num">2</div>
              <div class="step-body">
                <div class="step-title">导入数据集</div>
                <div class="step-desc">
                  点击数据集列表右上角的 <kbd>+</kbd> 按钮，选择本地 CSV 文件。系统自动解析列信息并存入数据库。
                </div>
              </div>
            </div>
            <div class="step-conn"></div>
            <div class="step-row">
              <div class="step-num">3</div>
              <div class="step-body">
                <div class="step-title">开始分析</div>
                <div class="step-desc">
                  从左侧选中数据集后，使用「数据处理工作流」进入各模块。建议顺序：数据视图 → 异常检测 → 缺失值插补 →
                  通量分割 → 导出。
                </div>
              </div>
            </div>
          </div>
          <div class="tip-box">
            <el-icon class="tip-icon"><Check /></el-icon>
            <span>每步处理自动生成新版本快照，所有历史版本可通过版本管理器随时查看和切换。</span>
          </div>
        </section>

        <!-- § 项目与数据集 -->
        <section id="gs-project" class="g-sec">
          <div class="sec-tag">项目管理</div>
          <h2 class="sec-h">项目与数据集管理</h2>
          <p class="sec-p">
            一个<strong>站点（项目）</strong>对应一个真实的生态监测站，可包含多个<strong>数据集</strong>，每个数据集对应一份原始
            CSV 文件。
          </p>
          <div class="ftable">
            <div class="frow frow-head">
              <div class="fc">操作</div>
              <div class="fc">说明</div>
            </div>
            <div class="frow">
              <div class="fc"><span class="badge b-green">创建站点</span></div>
              <div class="fc">填写站点名称、经纬度、海拔；创建后自动切换为当前站点。</div>
            </div>
            <div class="frow">
              <div class="fc"><span class="badge b-blue">导入数据集</span></div>
              <div class="fc">支持 UTF-8 编码的 CSV；导入时可指定时间列与缺失值标记符号。</div>
            </div>
            <div class="frow">
              <div class="fc"><span class="badge b-orange">版本管理</span></div>
              <div class="fc">每次执行处理操作自动保存新版本，可在版本管理器中回溯和对比。</div>
            </div>
            <div class="frow">
              <div class="fc"><span class="badge b-red">删除</span></div>
              <div class="fc">删除数据集前请先确认已备份，删除操作不可撤销。</div>
            </div>
          </div>
          <div class="tip-box tip-warn">
            <el-icon class="tip-icon"><Warning /></el-icon>
            <span>CSV 第一行须为列标题。时间列建议使用 ISO 8601 格式，如 <code>2024-01-01 00:30:00</code>。</span>
          </div>
        </section>

        <!-- § 数据视图 -->
        <section id="gs-overview" class="g-sec">
          <div class="sec-tag">数据视图</div>
          <h2 class="sec-h">数据概览与可视化</h2>
          <p class="sec-p">进入「数据视图 → 数据概览」面板，查看基本统计信息并对任意列进行时序可视化。</p>
          <div class="cards4">
            <div class="card4">
              <div class="c4-title">📊 基础统计</div>
              <div class="c4-desc">自动计算每列的均值、标准差、最小/最大值、非空记录数及缺失率。</div>
            </div>
            <div class="card4">
              <div class="c4-title">📈 时序图表</div>
              <div class="c4-desc">选择任意列生成交互式时序折线图；支持缩放、框选和导出 PNG。</div>
            </div>
            <div class="card4">
              <div class="c4-title">🔢 缺失标记</div>
              <div class="c4-desc">可自定义缺失值标记值（如 -9999），系统在统计和可视化中统一识别。</div>
            </div>
            <div class="card4">
              <div class="c4-title">🗂 版本切换</div>
              <div class="c4-desc">右上角「版本管理」随时切换不同处理阶段的数据快照。</div>
            </div>
          </div>
        </section>

        <!-- § 相关性分析 -->
        <section id="gs-correlation" class="g-sec">
          <div class="sec-tag">相关性分析</div>
          <h2 class="sec-h">变量相关性分析</h2>
          <p class="sec-p">「数据视图 → 相关性分析」面板计算并可视化各数值列之间的 Pearson 相关系数矩阵。</p>
          <div class="nsteps">
            <div class="ns">
              <div class="ns-num">①</div>
              <div class="ns-text">在列选择器中勾选需要分析的变量（支持全选或多选）。</div>
            </div>
            <div class="ns">
              <div class="ns-num">②</div>
              <div class="ns-text">点击「执行分析」，系统计算相关系数并渲染热力矩阵。</div>
            </div>
            <div class="ns">
              <div class="ns-num">③</div>
              <div class="ns-text">热力图颜色深浅表示相关强度；点击色块可查看精确系数值。</div>
            </div>
            <div class="ns">
              <div class="ns-num">④</div>
              <div class="ns-text">可导出热力图为 PNG 或复制系数表为 CSV 格式。</div>
            </div>
          </div>
          <div class="tip-box">
            <el-icon class="tip-icon"><Check /></el-icon>
            <span>建议在异常值处理完成后再进行相关性分析，以减少异常值对系数的干扰。</span>
          </div>
        </section>

        <!-- § 异常值检测 -->
        <section id="gs-outlier" class="g-sec">
          <div class="sec-tag">异常值检测</div>
          <h2 class="sec-h">识别与处理异常数据</h2>
          <p class="sec-p">「异常检测」面板提供多种方法识别数值列中的异常值，并支持多种处理策略。</p>
          <div class="methods">
            <div class="method">
              <span class="mbadge mb-blue">Z-Score / 3σ 准则</span>
              <div class="mdesc">计算均值与标准差，偏差超过 N 倍σ的点标记为异常；适用于近似正态分布的数据。</div>
            </div>
            <div class="method">
              <span class="mbadge mb-orange">IQR 箱线图准则</span>
              <div class="mdesc">
                基于四分位距设定上下界，超出 Q1−1.5·IQR 或 Q3+1.5·IQR 的值为异常；对非正态分布更鲁棒。
              </div>
            </div>
            <div class="method">
              <span class="mbadge mb-purple">物理极值阈值</span>
              <div class="mdesc">手动设置每列的合理物理范围，超出范围的记录直接标记为异常。</div>
            </div>
          </div>
          <div class="sub-title">处理策略</div>
          <div class="itags">
            <span class="itag">标记（保留原值）</span>
            <span class="itag">替换为 NaN</span>
            <span class="itag">删除行</span>
            <span class="itag">替换为均值/中位数</span>
          </div>
          <div class="tip-box">
            <el-icon class="tip-icon"><Check /></el-icon>
            <span>推荐先「标记」再结合图表人工审核，确认无误后再执行实际替换；处理结果保存为新版本。</span>
          </div>
        </section>

        <!-- § 缺失值插补 -->
        <section id="gs-gapfill" class="g-sec">
          <div class="sec-tag">缺失值插补</div>
          <h2 class="sec-h">缺失数据的检测与填补</h2>
          <p class="sec-p">「缺失值处理（Gap Filling）」面板提供从简单插值到深度学习的多种插补方法。</p>
          <div class="methods">
            <div class="method">
              <span class="mbadge mb-blue">线性插值</span>
              <div class="mdesc">对短间隔缺失（≤ 2h）使用相邻有效值进行线性插值，速度快、计算开销低。</div>
            </div>
            <div class="method">
              <span class="mbadge mb-orange">均值 / 中位数填充</span>
              <div class="mdesc">使用列整体或滚动窗口内的统计量填充，适合无明显趋势的场景。</div>
            </div>
            <div class="method">
              <span class="mbadge mb-purple">随机森林</span>
              <div class="mdesc">
                以其他变量为特征训练随机森林模型预测缺失值；处理非线性关系能力强，推荐用于中长间隔缺口。
              </div>
            </div>
            <div class="method">
              <span class="mbadge mb-green">深度学习（SAITS）</span>
              <div class="mdesc">基于自注意力机制的时序插补模型，适合大规模、长缺口数据；GPU 环境下性能最佳。</div>
            </div>
          </div>
          <div class="nsteps" style="margin-top: 12px">
            <div class="ns">
              <div class="ns-num">①</div>
              <div class="ns-text">在「缺失分析」标签查看各列缺失率和缺失分布热力图，了解数据质量。</div>
            </div>
            <div class="ns">
              <div class="ns-num">②</div>
              <div class="ns-text">选择目标列和插补方法，配置参数（窗口大小、模型参数等）。</div>
            </div>
            <div class="ns">
              <div class="ns-num">③</div>
              <div class="ns-text">点击「执行插补」，系统异步运行并在完成后推送通知；结果以新版本保存。</div>
            </div>
            <div class="ns">
              <div class="ns-num">④</div>
              <div class="ns-text">在「插补结果」视图对比原始值与填补值，评估插补质量。</div>
            </div>
          </div>
        </section>

        <!-- § 通量分割 -->
        <section id="gs-flux" class="g-sec">
          <div class="sec-tag">通量分割</div>
          <h2 class="sec-h">基于 REddyProc 的通量分割</h2>
          <p class="sec-p">
            「通量分割」面板调用 R 语言
            <strong>REddyProc</strong> 包对碳通量（NEE）进行生态系统呼吸（Reco）与总初级生产力（GPP）的分割。
          </p>
          <div class="methods">
            <div class="method">
              <span class="mbadge mb-blue">夜间法（Reichstein 2005）</span>
              <div class="mdesc">
                利用夜间 NEE 数据拟合温度响应函数推算 Reco，再用 NEE − Reco 计算 GPP；推荐用于常规数据集。
              </div>
            </div>
            <div class="method">
              <span class="mbadge mb-orange">白天法（Lasslop 2010）</span>
              <div class="mdesc">利用光响应曲线同时估算 Reco 和 GPP；对夜间数据质量较差时更稳健。</div>
            </div>
          </div>
          <div class="sub-title">必填变量映射</div>
          <div class="ftable compact">
            <div class="frow frow-head">
              <div class="fc">变量</div>
              <div class="fc">含义</div>
              <div class="fc">典型列名</div>
            </div>
            <div class="frow">
              <div class="fc"><code>NEE</code></div>
              <div class="fc">净生态系统碳交换量</div>
              <div class="fc">NEE / Fc</div>
            </div>
            <div class="frow">
              <div class="fc"><code>Rg</code></div>
              <div class="fc">全球辐射（短波入射）</div>
              <div class="fc">Rg / SW_IN</div>
            </div>
            <div class="frow">
              <div class="fc"><code>Tair</code></div>
              <div class="fc">气温（°C）</div>
              <div class="fc">Ta / Tair</div>
            </div>
            <div class="frow">
              <div class="fc"><code>VPD</code></div>
              <div class="fc">饱和水汽压差（hPa）</div>
              <div class="fc">VPD</div>
            </div>
            <div class="frow">
              <div class="fc"><code>Ustar</code></div>
              <div class="fc">摩擦风速（m/s）</div>
              <div class="fc">Ustar / u*</div>
            </div>
          </div>
          <div class="tip-box tip-warn">
            <el-icon class="tip-icon"><Warning /></el-icon>
            <span>运行前须确保 NEE 列已完成缺失值插补；系统使用 Ustar 阈值过滤低湍流夜间数据。</span>
          </div>
        </section>

        <!-- § 导出数据 -->
        <section id="gs-export" class="g-sec">
          <div class="sec-tag">导出数据</div>
          <h2 class="sec-h">导出处理结果</h2>
          <p class="sec-p">「导出数据」面板支持将任意版本的数据以多种格式导出到本地。</p>
          <div class="cards4">
            <div class="card4">
              <div class="c4-title">📄 CSV 导出</div>
              <div class="c4-desc">导出标准逗号分隔文件，兼容 Excel、R、Python；可自定义分隔符和编码。</div>
            </div>
            <div class="card4">
              <div class="c4-title">🗃 选列导出</div>
              <div class="c4-desc">勾选需要保留的列后导出，精简数据文件体积。</div>
            </div>
            <div class="card4">
              <div class="c4-title">🕑 版本选择</div>
              <div class="c4-desc">可选择导出「原始版本」或任意处理后的历史版本快照。</div>
            </div>
            <div class="card4">
              <div class="c4-title">📊 图表导出</div>
              <div class="c4-desc">各分析面板图表均支持通过右上角菜单导出为 PNG 或 SVG。</div>
            </div>
          </div>
          <div class="nsteps" style="margin-top: 12px">
            <div class="ns">
              <div class="ns-num">①</div>
              <div class="ns-text">切换到「导出数据」选项卡，选择目标版本和导出格式。</div>
            </div>
            <div class="ns">
              <div class="ns-num">②</div>
              <div class="ns-text">勾选需要导出的列（默认全选）。</div>
            </div>
            <div class="ns">
              <div class="ns-num">③</div>
              <div class="ns-text">点击「导出」，在系统文件选择对话框中指定保存路径。</div>
            </div>
          </div>
          <div class="tip-box">
            <el-icon class="tip-icon"><Check /></el-icon>
            <span>导出文件名默认为「数据集名称 + 版本号 + 时间戳」，可在弹出框中自行修改。</span>
          </div>
        </section>
      </div>
      <!-- /g-content -->
    </div>
    <!-- /g-body -->
  </el-dialog>
</template>

<style scoped>
/* ── Dialog 覆盖 ── */
:deep(.user-guide-dialog .el-dialog) {
  border-radius: 16px;
  overflow: hidden;
  padding: 0;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(229, 231, 235, 0.6);
}
:deep(.user-guide-dialog .el-dialog__header) {
  padding: 0;
  margin: 0;
}
:deep(.user-guide-dialog .el-dialog__body) {
  padding: 0;
}

/* ── 顶栏 ── */
.g-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 16px;
  background: linear-gradient(135deg, #fff 0%, #f0fdf4 100%);
  border-bottom: 1px solid #e5e7eb;
}
.g-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.g-header-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
}
.g-header-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.g-header-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
.g-close-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  transition: all 0.18s;
}
.g-close-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #ef4444;
}

/* ── 主体布局 ── */
.g-body {
  display: flex;
  height: 540px;
  overflow: hidden;
}

/* ── 左侧导航 ── */
.g-nav {
  width: 160px;
  flex-shrink: 0;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  padding: 14px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.g-nav-label {
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 8px;
  margin-bottom: 8px;
}
.g-nav-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: #374151;
  transition: all 0.18s;
}
.g-nav-item:hover {
  background: #ecfdf5;
  color: #059669;
}
.g-nav-item.active {
  background: #d1fae5;
  color: #047857;
  font-weight: 600;
}
.n-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.n-arrow {
  font-size: 11px;
  margin-left: auto;
  opacity: 0.35;
}
.g-nav-item.active .n-arrow {
  opacity: 0.75;
}

/* ── 右侧内容 ── */
.g-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
}
.g-content::-webkit-scrollbar {
  width: 5px;
}
.g-content::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.7);
  border-radius: 3px;
}

/* ── 各章节 ── */
.g-sec {
  padding-bottom: 32px;
  margin-bottom: 32px;
  border-bottom: 1px solid #f3f4f6;
}
.g-sec:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 8px;
}
.sec-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  background: #d1fae5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  padding: 2px 9px;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sec-h {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px;
}
.sec-p {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.7;
  margin: 0 0 14px;
}

/* ── 步骤流 ── */
.steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 14px;
}
.step-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-body {
  flex: 1;
  padding-bottom: 4px;
}
.step-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 3px;
}
.step-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}
.step-conn {
  width: 28px;
  border-left: 2px dashed #d1fae5;
  height: 14px;
  margin-left: 13px;
}
kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  color: #374151;
}
code {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
  font-family: "Courier New", monospace;
}

/* ── Tip 提示框 ── */
.tip-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 14px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  font-size: 12px;
  color: #065f46;
  line-height: 1.6;
}
.tip-box.tip-warn {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}
.tip-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ── 表格 ── */
.ftable {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 4px;
}
.ftable.compact .fc {
  font-size: 12px;
}
.frow {
  display: flex;
}
.frow-head {
  background: #f9fafb;
}
.frow-head .fc {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.fc {
  flex: 1;
  padding: 9px 12px;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}
.frow:last-child .fc {
  border-bottom: none;
}
.frow:not(.frow-head):hover .fc {
  background: #f9fafb;
}

/* ── 操作徽章 ── */
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 5px;
}
.b-green {
  background: #d1fae5;
  color: #047857;
}
.b-blue {
  background: #dbeafe;
  color: #1d4ed8;
}
.b-orange {
  background: #ffedd5;
  color: #c2410c;
}
.b-red {
  background: #fee2e2;
  color: #b91c1c;
}

/* ── 4卡片网格 ── */
.cards4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 4px;
}
.card4 {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  transition: all 0.18s;
}
.card4:hover {
  border-color: #a7f3d0;
  background: #f0fdf4;
}
.c4-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 5px;
}
.c4-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}

/* ── 有序步骤 ── */
.nsteps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ns {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.ns-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #047857;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ns-text {
  font-size: 13px;
  color: #374151;
  line-height: 1.6;
  padding-top: 1px;
}

/* ── 方法列表 ── */
.methods {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.method {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
}
.mbadge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 5px;
  margin-bottom: 5px;
}
.mb-blue {
  background: #dbeafe;
  color: #1d4ed8;
}
.mb-orange {
  background: #ffedd5;
  color: #c2410c;
}
.mb-purple {
  background: #ede9fe;
  color: #6d28d9;
}
.mb-green {
  background: #d1fae5;
  color: #047857;
}
.mdesc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}

/* ── 标题 & 内联标签 ── */
.sub-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin: 10px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.itags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.itag {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 20px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #374151;
}
</style>
