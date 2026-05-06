<template>
  <div class="beon-qc-page">
    <header class="page-header">
      <h1 class="title">BEON QC 管线</h1>
      <p class="subtitle">通量/非通量数据质量控制与 REddyProc 插补</p>
    </header>

    <main class="page-main">
      <!-- LEFT: Config Form -->
      <section class="config-section card">
        <el-form :model="form" label-width="120px" class="config-form">
          <!-- MySQL 连接 -->
          <div class="form-group">
            <h3 class="group-title">1. 数据库连接</h3>
            <el-form-item label="连接配置" required>
              <div class="connection-row">
                <el-select
                  v-model="form.connectionProfileId"
                  placeholder="请选择 MySQL 连接"
                  style="flex: 1"
                  @change="handleConnectionProfileChange">
                  <el-option
                    v-for="profile in connectionProfiles"
                    :key="profile.id"
                    :label="profile.profileName"
                    :value="Number(profile.id)" />
                </el-select>
                <el-button type="primary" plain @click="showConnDialog = true">新建连接</el-button>
              </div>
            </el-form-item>
            <el-form-item label="本地数据目录" required>
              <div class="connection-row">
                <el-input
                  v-model="form.localDataDir"
                  placeholder="选择 BEON QC 数据持久化目录"
                  readonly
                  style="flex: 1" />
                <el-button type="primary" plain @click="chooseLocalDataDir">选择目录</el-button>
              </div>
            </el-form-item>
          </div>

          <!-- 站点管理 -->
          <div class="form-group">
            <div class="group-header">
              <h3 class="group-title">2. 站点管理</h3>
              <div class="group-actions">
                <el-button
                  type="primary"
                  plain
                  size="small"
                  native-type="button"
                  @click="loadSiteRules"
                  :loading="loadingSites"
                  >从数据库加载</el-button
                >
                <el-button type="primary" size="small" native-type="button" @click="addSite">添加站点</el-button>
              </div>
            </div>

            <div class="site-list-scroll">
              <div v-for="(site, index) in form.sites" :key="index" class="site-entry">
                <div class="site-entry-header">
                  <span class="site-index"
                    >{{ site.abbr_name || `站点 ${index + 1}` }}
                    <span class="site-code-tag">{{ site.siteCode }}</span>
                  </span>
                  <el-button type="danger" link @click="removeSite(index)">移除</el-button>
                </div>
                <div class="site-grid">
                  <el-form-item label="经度">
                    <el-input-number v-model="site.longitude" :precision="3" :step="0.1" />
                  </el-form-item>
                  <el-form-item label="纬度">
                    <el-input-number v-model="site.latitude" :precision="3" :step="0.1" />
                  </el-form-item>
                  <el-form-item label="海拔">
                    <el-input-number v-model="site.altitude" :precision="1" :step="1" />
                  </el-form-item>
                  <el-form-item
                    v-for="(_, tableIndex) in site.tableNames.flux"
                    :key="`flux-${tableIndex}`"
                    :label="`Flux 表名${site.tableNames.flux.length > 1 ? ` ${tableIndex + 1}` : ''}`">
                    <el-input v-model="site.tableNames.flux[tableIndex]" :placeholder="`${site.siteCode}_fluxs`" />
                  </el-form-item>
                  <el-form-item
                    v-for="(_, tableIndex) in site.tableNames.sapflow"
                    :key="`sapflow-${tableIndex}`"
                    :label="`Sapflow 表名${site.tableNames.sapflow.length > 1 ? ` ${tableIndex + 1}` : ''}`">
                    <el-input
                      v-model="site.tableNames.sapflow[tableIndex]"
                      :placeholder="`${site.siteCode}_sapflows`" />
                  </el-form-item>
                  <el-form-item
                    v-for="(_, tableIndex) in site.tableNames.aqi"
                    :key="`aqi-${tableIndex}`"
                    :label="`AQI 表名${site.tableNames.aqi.length > 1 ? ` ${tableIndex + 1}` : ''}`">
                    <el-input v-model="site.tableNames.aqi[tableIndex]" :placeholder="`${site.siteCode}_aqis`" />
                  </el-form-item>
                  <el-form-item
                    v-for="(_, tableIndex) in site.tableNames.nai"
                    :key="`nai-${tableIndex}`"
                    :label="`NAI 表名${site.tableNames.nai.length > 1 ? ` ${tableIndex + 1}` : ''}`">
                    <el-input v-model="site.tableNames.nai[tableIndex]" :placeholder="`${site.siteCode}_nais`" />
                  </el-form-item>
                </div>
              </div>
            </div>
            <div v-if="form.sites.length === 0" class="empty-text">请添加站点或从数据库加载配置</div>
          </div>

          <!-- 时间范围 -->
          <div class="form-group">
            <h3 class="group-title">3. 时间范围</h3>
            <div class="flex-row">
              <el-form-item label="开始时间" required>
                <el-date-picker
                  v-model="form.startTime"
                  type="datetime"
                  format="YYYY-MM-DD HH:mm:ss"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择开始时间" />
              </el-form-item>
              <el-form-item label="结束时间" required>
                <el-date-picker
                  v-model="form.endTime"
                  type="datetime"
                  format="YYYY-MM-DD HH:mm:ss"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择结束时间" />
              </el-form-item>
            </div>
          </div>

          <!-- 数据类型 -->
          <div class="form-group">
            <h3 class="group-title">4. 数据类型</h3>
            <el-form-item label="执行管线">
              <el-checkbox-group v-model="form.dataTypes">
                <el-checkbox
                  v-for="option in dataTypeOptions"
                  :key="option.value"
                  :label="option.value"
                  :disabled="isDataTypeUnavailable(option.value)"
                  >{{ option.label }}</el-checkbox
                >
              </el-checkbox-group>
            </el-form-item>
          </div>

          <!-- QC 参数 -->
          <div class="form-group">
            <h3 class="group-title">5. QC 参数</h3>
            <el-form-item label="QC 标志过滤">
              <el-select v-model="form.qcFlagList" multiple placeholder="选择允许的 QC 标志">
                <el-option label="0 (最佳)" value="0" />
                <el-option label="1 (可用)" value="1" />
                <el-option label="2 (需注意)" value="2" />
              </el-select>
            </el-form-item>
            <el-form-item label="存储项修正">
              <el-switch v-model="form.useStrg" />
            </el-form-item>
            <el-form-item label="去刺 Z 阈值">
              <el-input-number v-model="form.despikingZ" :min="1" :max="10" :step="0.5" />
            </el-form-item>
          </div>

          <el-collapse v-model="activeCollapse">
            <!-- Flux 列映射 -->
            <el-collapse-item title="Flux 列映射配置" name="flux">
              <div class="mapping-grid">
                <el-form-item label="CO2 Flux"><el-input v-model="form.fluxColumnMapping.co2FluxCol" /></el-form-item>
                <el-form-item label="H2O Flux"><el-input v-model="form.fluxColumnMapping.h2oFluxCol" /></el-form-item>
                <el-form-item label="LE"><el-input v-model="form.fluxColumnMapping.leCol" /></el-form-item>
                <el-form-item label="H"><el-input v-model="form.fluxColumnMapping.hCol" /></el-form-item>

                <el-form-item label="QC CO2"><el-input v-model="form.fluxColumnMapping.qcCo2FluxCol" /></el-form-item>
                <el-form-item label="QC H2O"><el-input v-model="form.fluxColumnMapping.qcH2oFluxCol" /></el-form-item>
                <el-form-item label="QC LE"><el-input v-model="form.fluxColumnMapping.qcLeCol" /></el-form-item>
                <el-form-item label="QC H"><el-input v-model="form.fluxColumnMapping.qcHCol" /></el-form-item>

                <el-form-item label="PPFD"><el-input v-model="form.fluxColumnMapping.ppfdCol" /></el-form-item>
                <el-form-item label="Rg"><el-input v-model="form.fluxColumnMapping.rgRawCol" /></el-form-item>
                <el-form-item label="Tair"><el-input v-model="form.fluxColumnMapping.tairRawCol" /></el-form-item>
                <el-form-item label="RH"><el-input v-model="form.fluxColumnMapping.rhRawCol" /></el-form-item>

                <el-form-item label="VPD"><el-input v-model="form.fluxColumnMapping.vpdRawCol" /></el-form-item>
                <el-form-item label="Ustar"><el-input v-model="form.fluxColumnMapping.ustarRawCol" /></el-form-item>
                <el-form-item label="SW OUT"><el-input v-model="form.fluxColumnMapping.shortUpCol" /></el-form-item>
                <el-form-item label="Ta 12m"><el-input v-model="form.fluxColumnMapping.ta12mCol" /></el-form-item>

                <el-form-item label="SC Fc"><el-input v-model="form.fluxColumnMapping.co2StrgCol" /></el-form-item>
                <el-form-item label="SC Fe"><el-input v-model="form.fluxColumnMapping.h2oStrgCol" /></el-form-item>
                <el-form-item label="SC LE"><el-input v-model="form.fluxColumnMapping.leStrgCol" /></el-form-item>
                <el-form-item label="SC H"><el-input v-model="form.fluxColumnMapping.hStrgCol" /></el-form-item>

                <el-form-item label="RH 12m"><el-input v-model="form.fluxColumnMapping.rh12mCol" /></el-form-item>
                <el-form-item label="RH 10m"><el-input v-model="form.fluxColumnMapping.rh10mCol" /></el-form-item>
              </div>
            </el-collapse-item>

            <!-- 高级参数 -->
            <el-collapse-item title="高级参数配置" name="advanced">
              <el-form-item label-width="200px">
                <template #label
                  ><span class="label-with-tip"
                    >day_size
                    <el-tooltip content="despiking窗口天数，对应add_window_tag(day_size=13)"
                      ><el-icon><QuestionFilled /></el-icon></el-tooltip></span
                ></template>
                <el-input-number v-model="form.despikingWindowDays" :min="1" />
              </el-form-item>
              <el-form-item label-width="200px">
                <template #label
                  ><span class="label-with-tip"
                    >ppfd_1_1_1_threshold
                    <el-tooltip content="昼夜判断阈值，对应judge_day_night(ppfd_1_1_1_threshold=5)"
                      ><el-icon><QuestionFilled /></el-icon></el-tooltip></span
                ></template>
                <el-input-number v-model="form.ppfdDayNightThreshold" :min="0" />
              </el-form-item>
              <el-form-item label-width="200px">
                <template #label
                  ><span class="label-with-tip"
                    >sapflow_std_window
                    <el-tooltip content="茎流标准差滑动窗口大小，对应standard_deviation_limit中窗口480"
                      ><el-icon><QuestionFilled /></el-icon></el-tooltip></span
                ></template>
                <el-input-number v-model="form.sapflowStdWindow" :min="1" />
              </el-form-item>
              <el-form-item label-width="200px">
                <template #label
                  ><span class="label-with-tip"
                    >sapflow_std_step
                    <el-tooltip content="茎流标准差滑动步长，对应standard_deviation_limit中步长96"
                      ><el-icon><QuestionFilled /></el-icon></el-tooltip></span
                ></template>
                <el-input-number v-model="form.sapflowStdStep" :min="1" />
              </el-form-item>
            </el-collapse-item>

            <!-- 阈值配置 -->
            <el-collapse-item title="自定义物理阈值 (JSON)" name="thresholds">
              <el-input
                v-model="form.thresholdsJson"
                type="textarea"
                :rows="4"
                placeholder='{"co2_flux": {"lower": -50, "upper": 50}}' />
            </el-collapse-item>
          </el-collapse>

          <!-- 输出目录 -->
          <div class="form-group">
            <h3 class="group-title">6. 输出目录</h3>
            <el-form-item label="保存路径" required>
              <div class="connection-row">
                <el-input v-model="form.outputDir" readonly placeholder="选择结果文件保存目录" style="flex: 1" />
                <el-button type="primary" plain @click="chooseOutputDir">选择目录</el-button>
              </div>
            </el-form-item>
          </div>
        </el-form>
      </section>

      <!-- RIGHT: Batch Task Monitor -->
      <section class="monitor-section card">
        <div class="monitor-header">
          <h2 class="title">任务监控</h2>
          <div class="control-actions">
            <el-button type="primary" @click="handleStart" :disabled="isRunning"> 开始执行 </el-button>
            <el-button type="danger" @click="handleCancel" :disabled="!isRunning"> 取消 </el-button>
          </div>
        </div>

        <div class="progress-overview" v-if="batchProgress">
          <div class="progress-text">已完成 {{ batchProgress.completedItems }} / {{ batchProgress.totalItems }}</div>
          <el-progress :percentage="overallPercentage" :status="overallPercentage >= 100 ? 'success' : ''" />
        </div>

        <div class="task-list">
          <div v-if="!batchProgress || !batchProgress.items.length" class="empty-text">暂无任务执行记录</div>
          <div v-for="item in batchProgress?.items || []" :key="itemKey(item)" class="task-item">
            <div class="task-item-header">
              <span class="task-title">{{ item.siteCode }} - {{ item.dataType.toUpperCase() }}</span>
              <div class="task-header-right">
                <span v-if="item.logs && item.logs.length" class="log-toggle" @click="toggleLogs(itemKey(item))">
                  {{ expandedLogs.has(itemKey(item)) ? "收起日志" : `日志 (${item.logs.length})` }}
                </span>
                <span :class="['status-badge', `status-${item.status.toLowerCase()}`]">
                  {{ getStatusText(item.status) }}
                </span>
              </div>
            </div>

            <el-progress
              :percentage="item.progress"
              :show-text="false"
              :status="item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'exception' : ''"
              class="task-progress" />

            <div class="task-message">{{ item.message || "等待中..." }}</div>
            <div v-if="item.error" class="task-error">
              <div :class="['error-text', { collapsed: !expandedErrors.has(itemKey(item)) }]">{{ item.error }}</div>
              <span v-if="item.error.length > 200" class="error-toggle" @click="toggleError(itemKey(item))">
                {{ expandedErrors.has(itemKey(item)) ? "收起" : "展开全部" }}
              </span>
            </div>

            <div class="task-meta" v-if="item.startedAt">
              开始: {{ formatTime(item.startedAt) }}
              <span v-if="item.finishedAt"> | 结束: {{ formatTime(item.finishedAt) }}</span>
            </div>

            <div v-if="item.status === 'COMPLETED' && getOutputFiles(item).length" class="task-output">
              <span class="output-label">输出:</span>
              <div class="output-list">
                <div v-for="file in getOutputFiles(item)" :key="file" class="output-row">
                  <span class="output-path" :title="file">{{ file }}</span>
                  <el-button type="primary" link size="small" @click="showInFolder(file)">打开文件夹</el-button>
                </div>
              </div>
            </div>

            <!-- Expandable Log Panel -->
            <div
              v-if="expandedLogs.has(itemKey(item)) && item.logs?.length"
              class="log-panel"
              :id="`log-panel-${itemKey(item)}`">
              <div v-for="(log, li) in item.logs" :key="li" :class="['log-line', `log-${log.level}`]">
                <span class="log-time">{{ log.time }}</span>
                <span class="log-level-tag">{{ log.level.toUpperCase() }}</span>
                <span class="log-text">{{ log.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 新建 MySQL 连接弹窗 -->
    <el-dialog
      v-model="showConnDialog"
      title="新建 MySQL 连接"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close>
      <el-form :model="connForm" label-width="100px">
        <el-form-item label="配置名称" required>
          <el-input v-model="connForm.profileName" placeholder="如: BEON 生产库" />
        </el-form-item>
        <el-form-item label="主机地址" required>
          <el-input v-model="connForm.host" placeholder="127.0.0.1" />
        </el-form-item>
        <el-form-item label="端口" required>
          <el-input-number v-model="connForm.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名" required>
          <el-input v-model="connForm.user" placeholder="root" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="connForm.password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="数据库名" required>
          <el-input v-model="connForm.database" placeholder="beon_qc" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleTestConnection" :loading="testingConn">测试连接</el-button>
          <el-button @click="showConnDialog = false">取消</el-button>
          <el-button type="primary" @click="handleSaveConnection" :disabled="!canSaveConn">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 站点选择弹窗 -->
    <el-dialog
      v-model="showSitePickerDialog"
      title="选择站点"
      width="850px"
      :close-on-click-modal="false"
      destroy-on-close>
      <el-table
        :data="remoteSites"
        style="width: 100%"
        max-height="400"
        @selection-change="(rows: any[]) => (selectedSiteIds = rows.map((r: any) => r.id))">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="abbr_name" label="站点名称" width="120" show-overflow-tooltip />
        <el-table-column prop="ftp" label="站点代码" min-width="140" show-overflow-tooltip />
        <el-table-column prop="equipment_ftps" label="设备 FTP" min-width="180" show-overflow-tooltip />
        <el-table-column prop="longitude" label="经度" width="130" show-overflow-tooltip />
        <el-table-column prop="latitude" label="纬度" width="130" show-overflow-tooltip />
        <el-table-column prop="altitude" label="海拔" width="80" />
      </el-table>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showSitePickerDialog = false">取消</el-button>
          <el-button type="primary" @click="confirmSitePick" :disabled="selectedSiteIds.length === 0">
            添加选中 ({{ selectedSiteIds.length }})
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { QuestionFilled } from "@element-plus/icons-vue";

// Types
import type { DatabaseConnectionProfile } from "@shared/types/mysqlInterface";
import type { BEONBatchRequest, BEONBatchProgressEvent, BEONBatchItem, BEONDataType } from "@shared/types/workflow";

const activeCollapse = ref<string[]>([]);

// State
const connectionProfiles = ref<DatabaseConnectionProfile[]>([]);
const batchId = ref<string | null>(null);
const batchProgress = ref<BEONBatchProgressEvent | null>(null);
const expandedLogs = ref<Set<string>>(new Set());
const expandedErrors = ref<Set<string>>(new Set());

const toggleError = (key: string) => {
  const s = expandedErrors.value;
  if (s.has(key)) s.delete(key);
  else s.add(key);
};

const toggleLogs = (key: string) => {
  const s = expandedLogs.value;
  if (s.has(key)) {
    s.delete(key);
  } else {
    s.add(key);
    // Auto-scroll to bottom after panel opens
    nextTick(() => {
      const el = document.getElementById(`log-panel-${key}`);
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
};

const itemKey = (item: BEONBatchItem) => `${item.siteCode}-${item.dataType}`;

const BEON_TABLE_SUFFIXES: Record<BEONDataType, string> = {
  flux: "_fluxs",
  sapflow: "_sapflows",
  aqi: "_aqis",
  nai: "_nais",
};

const BEON_ASSET_TYPE_BY_ID: Record<number, BEONDataType> = {
  1: "flux",
  2: "aqi",
  3: "nai",
  4: "sapflow",
};

const EMPTY_FTP_VALUES = new Set(["", "null", "undefined", "none", "nil", "nan", "na", "n/a", "-", "--"]);

const dataTypeOptions: Array<{ value: BEONDataType; label: string }> = [
  { value: "flux", label: "Flux" },
  { value: "sapflow", label: "Sapflow" },
  { value: "aqi", label: "AQI" },
  { value: "nai", label: "NAI" },
];

// 新建连接弹窗
const showConnDialog = ref(false);
const testingConn = ref(false);
const connForm = reactive({
  profileName: "",
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "",
});

const canSaveConn = computed(() => {
  return connForm.profileName.trim() && connForm.host.trim() && connForm.user.trim() && connForm.database.trim();
});

// 站点选择弹窗
const showSitePickerDialog = ref(false);
const loadingSites = ref(false);
const remoteSites = ref<any[]>([]);
const selectedSiteIds = ref<number[]>([]);

const isRunning = computed(() => {
  if (!batchProgress.value) return false;
  const items = batchProgress.value.items;
  return items.some(i => i.status === "RUNNING" || i.status === "PENDING");
});

const overallPercentage = computed(() => {
  if (!batchProgress.value || batchProgress.value.totalItems === 0) return 0;
  return Math.round((batchProgress.value.completedItems / batchProgress.value.totalItems) * 100);
});

// Form Data — local shape; assembled into BEONBatchRequest on submit
interface SiteEntry {
  siteId: number;
  siteCode: string;
  abbr_name: string;
  longitude: number;
  latitude: number;
  timezone: number;
  altitude: number;
  tableNames: Record<BEONDataType, string[]>;
  fluxTableName: string;
  sapflowTableName: string;
  aqiTableName: string;
  naiTableName: string;
}

const createDefaultTableNames = (siteCode: string): Record<BEONDataType, string[]> => ({
  flux: siteCode ? [`${siteCode}${BEON_TABLE_SUFFIXES.flux}`] : [""],
  sapflow: siteCode ? [`${siteCode}${BEON_TABLE_SUFFIXES.sapflow}`] : [""],
  aqi: siteCode ? [`${siteCode}${BEON_TABLE_SUFFIXES.aqi}`] : [""],
  nai: siteCode ? [`${siteCode}${BEON_TABLE_SUFFIXES.nai}`] : [""],
});

const normalizeFtpValue = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return EMPTY_FTP_VALUES.has(text.toLowerCase()) ? "" : text;
};

const isValidBEONTableName = (tableName: unknown): boolean => {
  const text = String(tableName ?? "").trim();
  if (!text) return false;
  for (const suffix of Object.values(BEON_TABLE_SUFFIXES)) {
    if (text.endsWith(suffix)) {
      return Boolean(normalizeFtpValue(text.slice(0, -suffix.length)));
    }
  }
  return Boolean(normalizeFtpValue(text));
};

const parseEquipmentTableNames = (
  source: string | undefined,
  fallbackSiteCode: string
): Record<BEONDataType, string[]> => {
  const tableNames: Record<BEONDataType, string[]> = {
    flux: [],
    sapflow: [],
    aqi: [],
    nai: [],
  };

  const entries = String(source || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex <= 0) continue;
    const assetTypeId = Number(entry.slice(0, separatorIndex));
    const dataType = BEON_ASSET_TYPE_BY_ID[assetTypeId];
    const ftp = normalizeFtpValue(entry.slice(separatorIndex + 1));
    if (!dataType || !ftp) continue;
    const tableName = `${ftp}${BEON_TABLE_SUFFIXES[dataType]}`;
    if (!tableNames[dataType].includes(tableName)) {
      tableNames[dataType].push(tableName);
    }
  }

  const fallback = normalizeFtpValue(fallbackSiteCode);
  if (fallback && Object.values(tableNames).every(values => values.length === 0)) {
    tableNames.flux.push(`${fallback}${BEON_TABLE_SUFFIXES.flux}`);
  }

  return tableNames;
};

const normalizeTableNames = (values: unknown): string[] => {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  const normalized = source
    .map(value => String(value).trim())
    .filter(tableName => isValidBEONTableName(tableName));
  return Array.from(new Set(normalized));
};

const normalizeSiteEntry = (site: Partial<SiteEntry>): SiteEntry => {
  const siteCode = site.siteCode || "";
  const tableNames: Record<BEONDataType, string[]> = {
    flux: normalizeTableNames(site.tableNames?.flux || [site.fluxTableName || ""]),
    sapflow: normalizeTableNames(site.tableNames?.sapflow || [site.sapflowTableName || ""]),
    aqi: normalizeTableNames(site.tableNames?.aqi || [site.aqiTableName || ""]),
    nai: normalizeTableNames(site.tableNames?.nai || [site.naiTableName || ""]),
  };

  const shouldKeepManualInputs = !site.siteId;
  if (shouldKeepManualInputs) {
    for (const dataType of Object.keys(tableNames) as BEONDataType[]) {
      if (tableNames[dataType].length > 0) continue;
      tableNames[dataType] = createDefaultTableNames(siteCode)[dataType];
    }
  }

  return {
    siteId: site.siteId ?? 0,
    siteCode,
    abbr_name: site.abbr_name || "",
    longitude: site.longitude ?? 0,
    latitude: site.latitude ?? 0,
    timezone: site.timezone ?? 8,
    altitude: site.altitude ?? 0,
    tableNames,
    fluxTableName: tableNames.flux[0] || "",
    sapflowTableName: tableNames.sapflow[0] || "",
    aqiTableName: tableNames.aqi[0] || "",
    naiTableName: tableNames.nai[0] || "",
  };
};

const hasDataTypeTable = (site: SiteEntry, dataType: BEONDataType): boolean => {
  return normalizeTableNames(site.tableNames?.[dataType]).length > 0;
};

const isDataTypeUnavailable = (dataType: BEONDataType): boolean => {
  return form.sites.length > 0 && !form.sites.some(site => hasDataTypeTable(site, dataType));
};

const syncAvailableDataTypes = () => {
  if (form.sites.length === 0) return;
  form.dataTypes = form.dataTypes.filter(dataType => !isDataTypeUnavailable(dataType));
};

const form = reactive({
  connectionProfileId: null as number | null,
  sites: [] as SiteEntry[],
  startTime: "2021-01-01 00:00:00",
  endTime: "",
  dataTypes: ["flux", "sapflow", "aqi", "nai"] as BEONDataType[],
  qcFlagList: ["0", "1", "2"],
  useStrg: false,
  despikingZ: 4,
  fluxColumnMapping: {
    co2FluxCol: "co2_flux",
    h2oFluxCol: "h2o_flux",
    leCol: "le",
    hCol: "h",
    qcCo2FluxCol: "qc_co2_flux",
    qcH2oFluxCol: "qc_h2o_flux",
    qcLeCol: "qc_le",
    qcHCol: "qc_h",
    ppfdCol: "ppfd_1_1_1",
    rgRawCol: "rg_1_1_2",
    tairRawCol: "ta_1_2_1",
    rhRawCol: "rh",
    vpdRawCol: "vpd",
    ustarRawCol: "u_",
    co2StrgCol: "co2_flux_strg",
    h2oStrgCol: "h2o_flux_strg",
    leStrgCol: "le_strg",
    hStrgCol: "h_strg",
    shortUpCol: "short_up_avg",
    rh12mCol: "rh_12m_avg",
    rh10mCol: "rh_10m_avg",
    ta12mCol: "ta_12m_avg",
  },
  despikingWindowDays: 13,
  ppfdDayNightThreshold: 5,
  sapflowStdWindow: 480,
  sapflowStdStep: 96,
  thresholdsJson: "",
  localDataDir: "",
  outputDir: "",
});

// Methods
const loadConnectionProfiles = async () => {
  try {
    const result = await window.electronAPI.invoke("mysql/get-connection-profiles", {});
    if (result?.success && result.data?.profiles) {
      connectionProfiles.value = result.data.profiles;
      syncSelectedConnectionProfile();
    } else {
      connectionProfiles.value = [];
      form.connectionProfileId = null;
    }
  } catch (err) {
    ElMessage.error("获取数据库连接配置失败");
  }
};

const syncSelectedConnectionProfile = () => {
  if (form.connectionProfileId == null) return;
  const profileId = Number(form.connectionProfileId);
  const profile = connectionProfiles.value.find(item => Number(item.id) === profileId);
  form.connectionProfileId = profile ? profile.id : null;
};

const handleConnectionProfileChange = (value: number | string | null) => {
  if (value == null || value === "") {
    form.connectionProfileId = null;
    return;
  }

  const profileId = Number(value);
  const profile = connectionProfiles.value.find(item => Number(item.id) === profileId);
  if (!profile) {
    form.connectionProfileId = null;
    ElMessage.warning("所选数据库连接不存在，请刷新连接配置");
    return;
  }

  form.connectionProfileId = profile.id;
  remoteSites.value = [];
  selectedSiteIds.value = [];
  showSitePickerDialog.value = false;
  ElMessage.success(`已选择数据库连接：${profile.profileName}`);
};

const handleTestConnection = async () => {
  testingConn.value = true;
  try {
    const result = await window.electronAPI.invoke("mysql/test-connection", {
      connection: {
        host: connForm.host,
        port: connForm.port,
        user: connForm.user,
        password: connForm.password,
        database: connForm.database,
      },
    });
    if (result?.success) {
      ElMessage.success("连接成功");
    } else {
      ElMessage.error(result?.error || "连接失败");
    }
  } catch (err) {
    ElMessage.error("测试连接失败");
  } finally {
    testingConn.value = false;
  }
};

const handleSaveConnection = async () => {
  if (!canSaveConn.value) return;
  try {
    const result = await window.electronAPI.invoke("mysql/save-connection-profile", {
      profileName: connForm.profileName.trim(),
      connection: {
        host: connForm.host,
        port: connForm.port,
        user: connForm.user,
        password: connForm.password,
        database: connForm.database,
      },
    });
    if (result?.success) {
      ElMessage.success("连接配置已保存");
      showConnDialog.value = false;
      // 刷新列表并自动选中新创建的配置
      await loadConnectionProfiles();
      if (result?.data?.id) {
        form.connectionProfileId = result.data.id;
      } else if (connectionProfiles.value.length > 0) {
        form.connectionProfileId = connectionProfiles.value[connectionProfiles.value.length - 1].id;
      }
      // 重置表单
      connForm.profileName = "";
      connForm.host = "127.0.0.1";
      connForm.port = 3306;
      connForm.user = "root";
      connForm.password = "";
      connForm.database = "";
    } else {
      ElMessage.error(result?.error || "保存失败");
    }
  } catch (err) {
    ElMessage.error("保存连接配置失败");
  }
};

const loadSiteRules = async () => {
  if (!form.connectionProfileId) {
    return ElMessage.warning("请先选择数据库连接");
  }
  loadingSites.value = true;
  try {
    const result = await window.electronAPI.invoke("mysql/query-beon-sites", {
      connectionProfileId: form.connectionProfileId,
    });
    const sites = result?.success ? result.data : null;
    if (!result?.success) {
      ElMessage.error(result?.error || "加载远程站点失败");
      return;
    }
    if (sites && sites.length > 0) {
      remoteSites.value = sites;
      selectedSiteIds.value = [];
      showSitePickerDialog.value = true;
    } else {
      ElMessage.info("远程数据库中未找到有效站点");
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "加载远程站点失败");
  } finally {
    loadingSites.value = false;
  }
};

const confirmSitePick = () => {
  const picked = remoteSites.value.filter((s: any) => selectedSiteIds.value.includes(s.id));
  const existingIds = new Set(form.sites.map(s => s.siteId));
  let addedCount = 0;
  for (const s of picked) {
    if (existingIds.has(s.id)) continue;
    const equipmentFtp = String(s.equipment_ftps || "")
      .split(",")
      .map(item => normalizeFtpValue(item))
      .find(Boolean);
    const code = normalizeFtpValue(s.ftp) || equipmentFtp || "";
    const tableNames = parseEquipmentTableNames(s.equipment_table_sources, code);
    form.sites.push({
      siteId: s.id ?? 0,
      siteCode: code,
      abbr_name: s.abbr_name || "",
      longitude: s.longitude ?? 0,
      latitude: s.latitude ?? 0,
      timezone: s.timezone ?? 8,
      altitude: s.altitude ?? 0,
      tableNames,
      fluxTableName: tableNames.flux[0] || "",
      sapflowTableName: tableNames.sapflow[0] || "",
      aqiTableName: tableNames.aqi[0] || "",
      naiTableName: tableNames.nai[0] || "",
    });
    existingIds.add(s.id);
    addedCount++;
  }
  showSitePickerDialog.value = false;
  if (addedCount > 0) {
    ElMessage.success(`已添加 ${addedCount} 个站点`);
  } else {
    ElMessage.info("所选站点已存在，未添加新站点");
  }
};

const addSite = () => {
  form.sites.push({
    siteId: 0,
    siteCode: "",
    abbr_name: "",
    longitude: 0,
    latitude: 0,
    timezone: 8,
    altitude: 0,
    tableNames: createDefaultTableNames(""),
    fluxTableName: "",
    sapflowTableName: "",
    aqiTableName: "",
    naiTableName: "",
  });
};

const removeSite = (index: number) => {
  form.sites.splice(index, 1);
};

const chooseOutputDir = async () => {
  const result = await window.electronAPI.invoke("dialog/open-directory", {
    title: "选择输出目录",
    defaultPath: form.outputDir || undefined,
  });
  if (result?.success && result.data) {
    form.outputDir = result.data;
  }
};

const chooseLocalDataDir = async () => {
  try {
    const result = await window.electronAPI.invoke("dialog/open-directory", {
      title: "选择 BEON QC 数据持久化目录",
      defaultPath: form.localDataDir || undefined,
    });
    if (!result?.success) {
      ElMessage.error(result?.error || "打开目录选择失败");
      return;
    }
    if (result.data) {
      form.localDataDir = result.data;
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "打开目录选择失败");
  }
};

const showInFolder = async (filePath: string) => {
  await window.electronAPI.invoke("shell/show-in-folder", { path: filePath });
};

const getOutputFiles = (item: BEONBatchItem): string[] => {
  const files = item.resultData?.outputFiles;
  if (Array.isArray(files)) {
    return files.filter((file): file is string => typeof file === "string" && file.length > 0);
  }
  return typeof item.resultData?.outputFile === "string" ? [item.resultData.outputFile] : [];
};

const handleStart = async () => {
  if (!form.connectionProfileId) return ElMessage.warning("请选择数据库连接");
  if (form.sites.length === 0) return ElMessage.warning("请至少添加一个站点");
  if (!form.startTime || !form.endTime) return ElMessage.warning("请选择时间范围");
  if (form.dataTypes.length === 0) return ElMessage.warning("请至少选择一种数据类型");
  if (!form.localDataDir) return ElMessage.warning("请选择 BEON QC 数据持久化目录");
  if (!form.outputDir) return ElMessage.warning("请选择输出目录");

  try {
    const executableDataTypes = form.dataTypes.filter(dataType => !isDataTypeUnavailable(dataType));
    if (executableDataTypes.length === 0) {
      return ElMessage.warning("当前站点没有可执行的数据类型表名");
    }
    if (executableDataTypes.length !== form.dataTypes.length) {
      const skipped = form.dataTypes
        .filter(dataType => isDataTypeUnavailable(dataType))
        .map(dataType => dataTypeOptions.find(option => option.value === dataType)?.label || dataType)
        .join("、");
      ElMessage.warning(`已跳过没有表名的数据类型：${skipped}`);
      form.dataTypes = executableDataTypes;
    }

    // Deep-clone to strip Vue reactive Proxy — Electron structuredClone cannot serialize Proxy objects
    const plain = JSON.parse(JSON.stringify(form));
    const request: BEONBatchRequest = {
      sites: plain.sites.map((s: any) => ({
        siteId: s.siteId,
        siteCode: s.siteCode,
        longitude: s.longitude,
        latitude: s.latitude,
        timezone: s.timezone,
        tableNames: {
          flux: normalizeTableNames(s.tableNames?.flux || []),
          sapflow: normalizeTableNames(s.tableNames?.sapflow || []),
          aqi: normalizeTableNames(s.tableNames?.aqi || []),
          nai: normalizeTableNames(s.tableNames?.nai || []),
        },
        fluxTableNames: normalizeTableNames(s.tableNames?.flux || []),
        sapflowTableNames: normalizeTableNames(s.tableNames?.sapflow || []),
        aqiTableNames: normalizeTableNames(s.tableNames?.aqi || []),
        naiTableNames: normalizeTableNames(s.tableNames?.nai || []),
        fluxTableName: s.tableNames?.flux?.[0] || s.fluxTableName || undefined,
        sapflowTableName: s.tableNames?.sapflow?.[0] || s.sapflowTableName || undefined,
        aqiTableName: s.tableNames?.aqi?.[0] || s.aqiTableName || undefined,
        naiTableName: s.tableNames?.nai?.[0] || s.naiTableName || undefined,
      })),
      dataTypes: executableDataTypes,
      startTime: plain.startTime,
      endTime: plain.endTime,
      connectionProfileId: plain.connectionProfileId,
      localDataDir: plain.localDataDir,
      outputDir: plain.outputDir,
      qcFlagList: plain.qcFlagList,
      useStrg: plain.useStrg,
      despikingZ: plain.despikingZ,
      thresholdsJson: plain.thresholdsJson || undefined,
      fluxColumnMapping: plain.fluxColumnMapping,
    };
    const res = await window.electronAPI.invoke("beon-batch/start", request);
    if (res && res.batchId) {
      batchId.value = res.batchId;
      ElMessage.success("任务已开始");
    } else {
      const msg = res?.error || "未知错误（未返回 batchId）";
      console.error("beon-batch/start 失败:", res);
      ElMessage.error(`启动任务失败: ${msg}`);
    }
  } catch (err: any) {
    console.error("handleStart 异常:", err);
    ElMessage.error(`启动任务失败: ${err?.message || err}`);
  }
};

const handleCancel = async () => {
  if (!batchId.value) return;
  try {
    await window.electronAPI.invoke("beon-batch/cancel", { batchId: batchId.value });
    ElMessage.info("已发送取消请求");
  } catch (err) {
    ElMessage.error("取消任务失败");
  }
};

const progressListener = (_event: any, data: BEONBatchProgressEvent) => {
  batchProgress.value = data;
  // Auto-scroll expanded log panels to bottom on new data
  nextTick(() => {
    for (const key of expandedLogs.value) {
      const el = document.getElementById(`log-panel-${key}`);
      if (el) el.scrollTop = el.scrollHeight;
    }
  });
};

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    PENDING: "等待中",
    RUNNING: "执行中",
    COMPLETED: "已完成",
    FAILED: "失败",
    CANCELLED: "已取消",
  };
  return map[status] || status;
};

const formatTime = (isoString: string | null) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
};

// Persistence — save to database via settings/update
const SETTINGS_KEY = "beon-qc-config";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let formLoaded = false;

const saveFormToDb = () => {
  if (!formLoaded) return; // don't save before initial load completes
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = JSON.parse(JSON.stringify(form));
      await window.electronAPI.invoke("settings/update", {
        key: SETTINGS_KEY,
        value: JSON.stringify(data),
      });
    } catch {}
  }, 500); // debounce 500ms
};

const loadFormFromDb = async () => {
  try {
    const result = await window.electronAPI.invoke("settings/get", { key: SETTINGS_KEY });
    const raw = result?.data;
    if (!raw) {
      formLoaded = true;
      return;
    }
    const saved = typeof raw === "string" ? JSON.parse(raw) : null;
    if (!saved) {
      formLoaded = true;
      return;
    }
    if (saved.connectionProfileId != null) form.connectionProfileId = saved.connectionProfileId;
    if (saved.sites?.length) form.sites = saved.sites.map((site: Partial<SiteEntry>) => normalizeSiteEntry(site));
    if (saved.startTime) form.startTime = saved.startTime;
    if (saved.endTime) form.endTime = saved.endTime;
    if (saved.dataTypes?.length) form.dataTypes = saved.dataTypes;
    if (saved.qcFlagList) form.qcFlagList = saved.qcFlagList;
    if (saved.useStrg != null) form.useStrg = saved.useStrg;
    if (saved.despikingZ != null) form.despikingZ = saved.despikingZ;
    if (saved.fluxColumnMapping) Object.assign(form.fluxColumnMapping, saved.fluxColumnMapping);
    if (saved.despikingWindowDays != null) form.despikingWindowDays = saved.despikingWindowDays;
    if (saved.ppfdDayNightThreshold != null) form.ppfdDayNightThreshold = saved.ppfdDayNightThreshold;
    if (saved.sapflowStdWindow != null) form.sapflowStdWindow = saved.sapflowStdWindow;
    if (saved.sapflowStdStep != null) form.sapflowStdStep = saved.sapflowStdStep;
    if (saved.thresholdsJson != null) form.thresholdsJson = saved.thresholdsJson;
    if (saved.localDataDir) form.localDataDir = saved.localDataDir;
    if (saved.outputDir) form.outputDir = saved.outputDir;
  } catch {}
  formLoaded = true;
};

watch(form, saveFormToDb, { deep: true });
watch(() => form.sites, syncAvailableDataTypes, { deep: true });

// Lifecycle
onMounted(async () => {
  await loadFormFromDb();
  loadConnectionProfiles();
  window.electronAPI.on("beon-batch/progress", progressListener);
});

onUnmounted(() => {
  window.electronAPI.removeListener("beon-batch/progress", progressListener);
});
</script>

<style scoped>
.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.beon-qc-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: var(--c-bg-base);
  box-sizing: border-box;
  padding: var(--space-4);
  gap: var(--space-4);
  overflow: hidden;
}

.page-header {
  flex-shrink: 0;
}

.page-header .title {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  margin: 0 0 var(--space-1) 0;
}

.page-header .subtitle {
  font-size: var(--text-md);
  color: var(--c-text-secondary);
  margin: 0;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: var(--space-4);
  min-height: 0; /* Important for flex-child scrolling */
}

.card {
  background-color: var(--c-bg-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
}

.config-section {
  flex: 6;
  overflow-y: auto;
  padding: var(--space-4);
}

.monitor-section {
  flex: 4;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
}

/* Config Form Styles */
.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.group-title {
  font-size: var(--text-lg);
  font-weight: var(--font-medium);
  color: var(--c-text-primary);
  margin: 0 0 var(--space-4) 0;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--c-border);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--c-border);
}

.group-header .group-title {
  margin: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.site-list-scroll {
  max-height: 320px;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.site-entry {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
  background-color: var(--c-bg-base);
}

.site-entry:last-child {
  margin-bottom: 0;
}

.site-entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.site-index {
  font-weight: var(--font-medium);
  color: var(--c-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.site-code-tag {
  font-weight: normal;
  font-size: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 1px 8px;
  border-radius: 4px;
}

.site-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

.mapping-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-2);
}

.flex-row {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.empty-text {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-4);
}

.connection-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* Monitor Styles */
.monitor-header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.monitor-header .title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--c-text-primary);
  margin: 0;
}

.control-actions {
  display: flex;
  gap: var(--space-2);
}

.progress-overview {
  padding: var(--space-4);
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.progress-text {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin-bottom: var(--space-2);
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.task-item {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  background-color: var(--c-bg-base);
}

.task-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.task-title {
  font-weight: var(--font-medium);
  font-size: var(--text-sm);
  color: var(--c-text-primary);
}

.status-badge {
  font-size: var(--text-sm);
  padding: 2px var(--space-2);
  border-radius: var(--radius-btn);
  font-weight: var(--font-medium);
}

.status-pending {
  background-color: var(--color-neutral-100, #f5f5f5);
  color: var(--c-text-muted);
}
.status-running {
  background-color: var(--c-info-bg);
  color: var(--c-info);
}
.status-completed {
  background-color: var(--c-brand-soft);
  color: var(--c-brand);
}
.status-failed {
  background-color: var(--c-danger-bg);
  color: var(--c-danger);
}
.status-cancelled {
  background-color: var(--c-warning-bg);
  color: var(--c-warning);
}

.task-progress {
  margin: var(--space-2) 0;
}

.task-message {
  font-size: var(--text-sm);
  color: var(--c-text-secondary);
  margin-bottom: var(--space-1);
}

.task-error {
  font-size: var(--text-sm);
  color: var(--c-danger);
  margin-bottom: var(--space-1);
}

.task-error .error-text {
  white-space: pre-wrap;
  word-break: break-all;
}

.task-error .error-text.collapsed {
  max-height: 3.6em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.task-error .error-toggle {
  display: inline-block;
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--c-primary);
  cursor: pointer;
}

.task-error .error-toggle:hover {
  text-decoration: underline;
}

.task-meta {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
}

.task-output {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--c-brand-soft, #f0f9eb);
  border-radius: var(--radius-btn);
}

.task-output .output-label {
  color: var(--c-text-muted);
  flex-shrink: 0;
}

.task-output .output-list {
  flex: 1;
  min-width: 0;
}

.task-output .output-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.task-output .output-path {
  color: var(--c-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.task-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.log-toggle {
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
  user-select: none;
}
.log-toggle:hover {
  text-decoration: underline;
}

.log-panel {
  margin-top: var(--space-2);
  max-height: 200px;
  overflow-y: auto;
  background: var(--el-fill-color-darker, #1e1e1e);
  border-radius: 4px;
  padding: var(--space-2);
  font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.log-line {
  display: flex;
  gap: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-time {
  color: var(--c-text-muted, #888);
  flex-shrink: 0;
}

.log-level-tag {
  flex-shrink: 0;
  font-weight: 600;
  min-width: 40px;
}

.log-info .log-level-tag {
  color: var(--el-color-info, #909399);
}
.log-warn .log-level-tag {
  color: var(--el-color-warning, #e6a23c);
}
.log-error .log-level-tag {
  color: var(--el-color-danger, #f56c6c);
}

.log-info .log-text {
  color: var(--c-text-secondary, #ccc);
}
.log-warn .log-text {
  color: var(--el-color-warning, #e6a23c);
}
.log-error .log-text {
  color: var(--el-color-danger, #f56c6c);
}
</style>
