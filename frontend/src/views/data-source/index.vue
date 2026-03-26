<template>
  <div class="data-source-page">

    <!-- ── 生态背景装饰 ──────────────────────────────── -->
    <div class="eco-backdrop" aria-hidden="true">
      <!-- 大叶 -->
      <svg class="eco-leaf eco-leaf--1" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M40 4C40 4 8 20 8 48C8 64 22 72 40 72C58 72 72 64 72 48C72 20 40 4 40 4Z" fill="currentColor"/>
        <path d="M40 72V4M40 42C30 47 22 53 18 62M40 42C50 47 58 53 62 62M40 28C33 32 27 37 24 43M40 28C47 32 53 37 56 43" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <!-- 小叶 -->
      <svg class="eco-leaf eco-leaf--2" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 3C30 3 6 15 6 36C6 48 16.5 54 30 54C43.5 54 54 48 54 36C54 15 30 3 30 3Z" fill="currentColor"/>
        <path d="M30 54V3M30 30C23 34 17 39 14 47M30 30C37 34 43 39 46 47" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      </svg>
      <!-- 地角叶 -->
      <svg class="eco-leaf eco-leaf--3" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M25 2C25 2 5 12 5 30C5 40 14 46 25 46C36 46 45 40 45 30C45 12 25 2 25 2Z" fill="currentColor"/>
        <path d="M25 46V2M25 24C20 27 15 31 13 37M25 24C30 27 35 31 37 37" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
      </svg>
      <!-- 生态监测网络节点图 -->
      <svg class="eco-network-graph" viewBox="0 0 480 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="55" y1="65" x2="145" y2="42" stroke="currentColor" stroke-width="1"/>
        <line x1="145" y1="42" x2="238" y2="72" stroke="currentColor" stroke-width="1"/>
        <line x1="238" y1="72" x2="338" y2="52" stroke="currentColor" stroke-width="1"/>
        <line x1="338" y1="52" x2="430" y2="38" stroke="currentColor" stroke-width="1"/>
        <line x1="55" y1="65" x2="95" y2="138" stroke="currentColor" stroke-width="1"/>
        <line x1="145" y1="42" x2="195" y2="118" stroke="currentColor" stroke-width="1"/>
        <line x1="195" y1="118" x2="298" y2="148" stroke="currentColor" stroke-width="1"/>
        <line x1="238" y1="72" x2="195" y2="118" stroke="currentColor" stroke-width="1"/>
        <line x1="338" y1="52" x2="380" y2="130" stroke="currentColor" stroke-width="1"/>
        <line x1="95" y1="138" x2="195" y2="118" stroke="currentColor" stroke-width="1"/>
        <line x1="298" y1="148" x2="380" y2="130" stroke="currentColor" stroke-width="1"/>
        <!-- 节点外环 -->
        <circle cx="55" cy="65" r="11" stroke="currentColor" stroke-width="0.7"/>
        <circle cx="238" cy="72" r="13" stroke="currentColor" stroke-width="0.7"/>
        <circle cx="195" cy="118" r="10" stroke="currentColor" stroke-width="0.7"/>
        <circle cx="338" cy="52" r="10" stroke="currentColor" stroke-width="0.7"/>
        <!-- 节点实心 -->
        <circle cx="55" cy="65" r="5" fill="currentColor"/>
        <circle cx="145" cy="42" r="4" fill="currentColor"/>
        <circle cx="238" cy="72" r="6" fill="currentColor"/>
        <circle cx="338" cy="52" r="5" fill="currentColor"/>
        <circle cx="430" cy="38" r="3.5" fill="currentColor"/>
        <circle cx="95" cy="138" r="3.5" fill="currentColor"/>
        <circle cx="195" cy="118" r="5" fill="currentColor"/>
        <circle cx="298" cy="148" r="4" fill="currentColor"/>
        <circle cx="380" cy="130" r="4" fill="currentColor"/>
      </svg>
    </div>

    <!-- ── 页面头部 ─────────────────────────────────── -->
    <div class="page-header">
      <div class="header-info">
        <div class="header-brand">
          <div class="eco-brand-icon">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2C16 2 4 9 4 20C4 26 9.5 30 16 30C22.5 30 28 26 28 20C28 9 16 2 16 2Z" fill="#40916c"/>
              <path d="M16 30V2" stroke="#1b4332" stroke-width="1.6" stroke-linecap="round"/>
              <path d="M16 19C12 22 9.5 24.5 8 28" stroke="#1b4332" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M16 19C20 22 22.5 24.5 24 28" stroke="#1b4332" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M16 13C13.5 15.2 12 17.5 11 20.5" stroke="#1b4332" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
              <path d="M16 13C18.5 15.2 20 17.5 21 20.5" stroke="#1b4332" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
            </svg>
          </div>
          <div class="brand-text">
            <h2 class="brand-title">数据源管理</h2>
            <p class="brand-subtitle">统一管理各种实时与定时数据接入通道</p>
          </div>
        </div>
        <div class="eco-network-stats">
          <div class="stat-item">
            <span class="stat-value">{{ treeData.length }}</span>
            <span class="stat-label">监测站点</span>
          </div>
          <span class="stat-sep">·</span>
          <div class="stat-item stat-item--running">
            <span class="stat-value">{{ runningCount }}</span>
            <span class="stat-label">运行中</span>
          </div>
          <span class="stat-sep">·</span>
          <div class="stat-item">
            <span class="stat-value">{{ totalSources }}</span>
            <span class="stat-label">数据通道</span>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <el-button class="btn-secondary" @click="openAddCategoryDialog()">
          <el-icon><FolderAdd /></el-icon> 新增分类
        </el-button>
        <el-button type="primary" class="btn-primary" @click="openAddChannelDialog(null)">
          <el-icon><Plus /></el-icon> 新增数据源
        </el-button>
      </div>
    </div>

    <div class="channel-list">
      <el-table
        :data="treeData"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        style="width: 100%"
        v-loading="loading"
        :row-class-name="getRowClass"
      >
        <el-table-column prop="name" label="名称" min-width="260">
          <template #default="{ row }">
            <div v-if="row.isCategory" class="category-name-cell">
              <div class="station-marker">
                <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="9" cy="9" r="8" fill="rgba(64,145,108,0.12)" stroke="rgba(64,145,108,0.55)" stroke-width="1"/>
                  <path d="M9 3.5C9 3.5 6.2 5.8 6.2 8.4C6.2 10 7.3 11 9 11C10.7 11 11.8 10 11.8 8.4C11.8 5.8 9 3.5 9 3.5Z" fill="#40916c"/>
                  <line x1="9" y1="14.5" x2="9" y2="10.8" stroke="#2d6a4f" stroke-width="1.1" stroke-linecap="round"/>
                </svg>
              </div>
              <span class="category-label">{{ row.name }}</span>
              <span class="count-badge">
                <span class="count-running">{{ row.children?.filter((c: any) => c.status === 'running').length ?? 0 }}</span>
                <span class="count-sep">/</span>
                <span class="count-total">{{ row.children?.length ?? 0 }}</span>
                <span class="count-unit">通道</span>
              </span>
            </div>
            <div v-else class="channel-name-cell">
              <span class="channel-type-icon">{{ getTypeIcon(row.type) }}</span>
              <span class="channel-name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag v-if="!row.isCategory" size="small" :type="getTypeTag(row.type)">{{ getTypeName(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <div v-if="!row.isCategory" class="status-cell">
              <span class="status-dot" :class="row.status"></span>
              {{ getStatusName(row.status) }}
            </div>
            <div v-else class="category-status-summary">
              <span
                class="status-dot"
                :class="row.children?.some((c: any) => c.status === 'error') ? 'error'
                  : row.children?.every((c: any) => c.status === 'running') ? 'running' : 'stopped'"
              />
              <span class="cat-status-text">{{ getCategoryStatusText(row.children) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最后同步时间" width="180">
          <template #default="{ row }">
            <span v-if="!row.isCategory" class="sync-time">{{ row.lastSync }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <template v-if="row.isCategory">
              <div class="category-ops">
                <el-button link type="primary" size="small" @click="openAddChannelDialog(row)">
                  <el-icon style="margin-right:2px"><Plus /></el-icon>新增数据源
                </el-button>
                <span class="ops-divider">|</span>
                <el-button link type="primary" size="small" @click="openRenameCategoryDialog(row)">重命名</el-button>
                <span class="ops-divider">|</span>
                <el-button link type="danger" size="small" @click="deleteCategory(row)">删除</el-button>
              </div>
            </template>
            <template v-else>
              <el-button link type="primary" @click="toggleStatus(row)">
                {{ row.status === "running" ? "停止" : "启动" }}
              </el-button>
              <el-button link type="primary" @click="editChannel(row)">配置</el-button>
              <el-button link type="primary" @click="viewLogs(row)">日志</el-button>
              <el-button link type="danger" @click="deleteChannel(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/重命名分类弹窗 -->
    <el-dialog
      v-model="showCategoryDialog"
      :title="editingCategory ? '重命名分类' : '新增分类'"
      width="420px"
      destroy-on-close
      class="data-source-dialog"
    >
      <el-form label-width="80px" style="padding: 0 8px">
        <el-form-item label="分类名称" required>
          <el-input v-model="categoryForm.name" placeholder="请输入分类名称，如：密云站" @keyup.enter="saveCategory" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showCategoryDialog = false">取消</el-button>
          <el-button type="primary" class="btn-primary" @click="saveCategory">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 新增数据源弹窗 -->
    <el-dialog v-model="showAddDialog" title="新增数据源" width="600px" destroy-on-close class="data-source-dialog">
      <el-form :model="form" label-width="100px" label-position="left">
        <el-form-item label="所属分类" required>
          <el-select v-model="form.categoryId" placeholder="请选择所属分类" style="width: 100%">
            <el-option v-for="cat in treeData" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据源名称" required>
          <el-input v-model="form.name" placeholder="请输入数据源名称" />
        </el-form-item>
        <el-form-item label="通道类型" required>
          <el-select v-model="form.type" placeholder="请选择接入协议" style="width: 100%">
            <el-option-group label="实时推送 (Real-time)">
              <el-option label="MQTT 订阅" value="mqtt" />
              <el-option label="WebSocket 长连接" value="websocket" />
              <el-option label="Webhook 回调" value="webhook" />
              <el-option label="Socket 直连" value="tcp" />
            </el-option-group>
            <el-option-group label="定时拉取 (Scheduled)">
              <el-option label="HTTP GET 轮询" value="http" />
              <el-option label="FTP/SFTP 同步" value="ftp" />
              <el-option label="云存储扫描 (OSS/S3)" value="cloud" />
            </el-option-group>
          </el-select>
        </el-form-item>

        <template v-if="form.type === 'mqtt'">
          <el-form-item label="Broker 地址" required>
            <el-input v-model="form.mqtt.broker" placeholder="tcp://broker.emqx.io:1883" />
          </el-form-item>
          <el-form-item label="Topic 订阅" required>
            <el-input v-model="form.mqtt.topic" placeholder="sensor/data/#" />
          </el-form-item>
        </template>
        <template v-if="form.type === 'websocket'">
          <el-form-item label="WS 地址" required>
            <el-input v-model="form.websocket.url" placeholder="wss://example.com/stream" />
          </el-form-item>
        </template>
        <template v-if="form.type === 'webhook'">
          <el-form-item label="回调路径" required>
            <el-input v-model="form.webhook.path" placeholder="/api/webhook/sensor1" />
          </el-form-item>
        </template>
        <template v-if="form.type === 'tcp'">
          <el-form-item label="设备 IP" required>
            <el-input v-model="form.tcp.ip" placeholder="192.168.1.100" />
          </el-form-item>
          <el-form-item label="端口" required>
            <el-input-number v-model="form.tcp.port" :min="1" :max="65535" />
          </el-form-item>
        </template>
        <template v-if="form.type === 'http'">
          <el-form-item label="API 地址" required>
            <el-input v-model="form.http.url" placeholder="https://api.example.com/data" />
          </el-form-item>
          <el-form-item label="拉取频率" required>
            <el-input-number v-model="form.http.interval" :min="1" /> <span style="margin-left: 10px">分钟</span>
          </el-form-item>
        </template>
        <template v-if="form.type === 'ftp'">
          <el-form-item label="主机地址" required>
            <el-input v-model="form.ftp.host" placeholder="ftp.example.com" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number v-model="form.ftp.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.ftp.username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.ftp.password" type="password" show-password />
          </el-form-item>
          <el-form-item label="同步路径">
            <el-input v-model="form.ftp.path" placeholder="/data/sensor/" />
          </el-form-item>
        </template>
        <template v-if="form.type === 'cloud'">
          <el-form-item label="存储类型">
            <el-select v-model="form.cloud.provider" style="width: 100%">
              <el-option label="阿里云 OSS" value="oss" />
              <el-option label="腾讯云 OBS" value="obs" />
              <el-option label="AWS S3" value="s3" />
            </el-select>
          </el-form-item>
          <el-form-item label="Bucket" required>
            <el-input v-model="form.cloud.bucket" />
          </el-form-item>
          <el-form-item label="AccessKey">
            <el-input v-model="form.cloud.ak" />
          </el-form-item>
          <el-form-item label="SecretKey">
            <el-input v-model="form.cloud.sk" type="password" show-password />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" class="btn-primary" @click="saveChannel">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 日志弹窗 -->
    <el-dialog v-model="showLogsDialog" :title="`接入日志 - ${currentLogChannel}`" width="700px" class="logs-dialog">
      <div class="logs-container">
        <div v-for="(log, idx) in mockLogs" :key="idx" class="log-item">
          <span class="log-time">{{ log.time }}</span>
          <span :class="['log-level', log.level.toLowerCase()]">[{{ log.level }}]</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, FolderAdd } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";

// ── 类型定义 ──────────────────────────────────────
interface DataSource {
  id: string;
  isCategory: false;
  name: string;
  type: string;
  status: "running" | "stopped" | "error";
  lastSync: string;
}

interface Category {
  id: string;
  isCategory: true;
  name: string;
  children: DataSource[];
}

// ── 硬编码站点分类列表 ─────────────────────────────
const STATION_NAMES = [
  "密云站", "喇叭沟门站", "砂石坑站", "青龙湖站", "百花山站",
  "大兴站", "野鸭湖站", "汉石桥站", "翠湖站", "长沟站",
  "十三陵站", "奥森站", "八达岭站", "龙潭湖站", "园科院站", "共青林场站",
];

// ── 初始化树形数据 ────────────────────────────────
function buildTreeData(): Category[] {
  const ftpTypes = [
    { label: "空气质量", base: 38600 },
    { label: "通量", base: 105400 },
    { label: "微气象", base: 263500 },
  ];
  const statusPattern: Array<"running" | "stopped" | "error"> = [
    "running", "running", "running", "running", "running",
    "running", "running", "running", "stopped", "running",
    "error", "running", "running", "running", "running",
    "running", "running", "running", "stopped", "running",
  ];
  const fmt = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const base = new Date("2026-03-18T14:30:00");
  let dsId = 1;
  let si = 0;

  return STATION_NAMES.map((station, stIdx) => {
    const children: DataSource[] = [];
    ftpTypes.forEach((ft, ftIdx) => {
      const status = statusPattern[si++ % statusPattern.length];
      const offset = status === "error" ? (18 + stIdx) * 3600000
        : status === "stopped" ? (3 + ftIdx) * 3600000
        : (stIdx * 2 + ftIdx * 3) * 60000;
      children.push({
        id: `ds_${dsId++}`,
        isCategory: false,
        name: `${station} ${ft.label} FTP`,
        type: "ftp",
        status,
        lastSync: fmt(new Date(base.getTime() - offset)),
      });
    });
    const sockStatus = statusPattern[si++ % statusPattern.length];
    const sockOffset = sockStatus === "error" ? (28 + stIdx) * 3600000
      : sockStatus === "stopped" ? (5 + stIdx) * 3600000
      : stIdx * 180000;
    children.push({
      id: `ds_${dsId++}`,
      isCategory: false,
      name: `${station} 负氧离子 Socket`,
      type: "tcp",
      status: sockStatus,
      lastSync: fmt(new Date(base.getTime() - sockOffset)),
    });
    return { id: `cat_${stIdx}`, isCategory: true, name: station, children };
  });
}

// ── 响应式数据 ────────────────────────────────────
const loading = ref(false);
const treeData = ref<Category[]>(buildTreeData());

const totalSources = computed(() =>
  treeData.value.reduce((acc, cat) => acc + (cat.children?.length ?? 0), 0)
);
const runningCount = computed(() =>
  treeData.value.reduce(
    (acc, cat) => acc + cat.children.filter((c: DataSource) => c.status === 'running').length,
    0
  )
);

// 分类弹窗
const showCategoryDialog = ref(false);
const editingCategory = ref<Category | null>(null);
const categoryForm = ref({ name: "" });

const openAddCategoryDialog = () => {
  editingCategory.value = null;
  categoryForm.value.name = "";
  showCategoryDialog.value = true;
};

const openRenameCategoryDialog = (row: Category) => {
  editingCategory.value = row;
  categoryForm.value.name = row.name;
  showCategoryDialog.value = true;
};

const saveCategory = () => {
  const name = categoryForm.value.name.trim();
  if (!name) { ElMessage.warning("分类名称不能为空"); return; }
  if (editingCategory.value) {
    editingCategory.value.name = name;
    ElMessage.success("重命名成功");
  } else {
    treeData.value.push({
      id: `cat_${Date.now()}`,
      isCategory: true,
      name,
      children: [],
    });
    ElMessage.success("分类创建成功");
  }
  showCategoryDialog.value = false;
};

const deleteCategory = (row: Category) => {
  ElMessageBox.confirm(
    `确定删除分类「${row.name}」及其下所有 ${row.children.length} 个数据源吗？`,
    "删除确认",
    { type: "warning" }
  ).then(() => {
    const idx = treeData.value.findIndex(c => c.id === row.id);
    if (idx !== -1) treeData.value.splice(idx, 1);
    ElMessage.success("删除成功");
  }).catch(() => {});
};

// 数据源弹窗
const showAddDialog = ref(false);
const form = ref({
  categoryId: "",
  name: "",
  type: "ftp",
  mqtt: { broker: "", topic: "" },
  websocket: { url: "" },
  webhook: { path: "", secret: "" },
  tcp: { ip: "", port: 8080 },
  http: { url: "", interval: 5 },
  ftp: { host: "", port: 21, username: "", password: "", path: "" },
  cloud: { provider: "oss", bucket: "", ak: "", sk: "" },
});

const openAddChannelDialog = (categoryRow: Category | null) => {
  form.value.categoryId = categoryRow?.id ?? (treeData.value[0]?.id ?? "");
  form.value.name = "";
  form.value.type = "ftp";
  showAddDialog.value = true;
};

const saveChannel = () => {
  if (!form.value.name.trim()) { ElMessage.warning("数据源名称不能为空"); return; }
  const cat = treeData.value.find(c => c.id === form.value.categoryId);
  if (cat) {
    cat.children.push({
      id: `ds_${Date.now()}`,
      isCategory: false,
      name: form.value.name,
      type: form.value.type,
      status: "stopped",
      lastSync: "-",
    });
  }
  showAddDialog.value = false;
  ElMessage.success("新增数据源成功");
};

const deleteChannel = (row: DataSource) => {
  ElMessageBox.confirm("确定要删除该数据源吗？", "提示", { type: "warning" })
    .then(() => {
      for (const cat of treeData.value) {
        const idx = cat.children.findIndex(c => c.id === row.id);
        if (idx !== -1) { cat.children.splice(idx, 1); break; }
      }
      ElMessage.success("删除成功");
    }).catch(() => {});
};

const toggleStatus = (row: DataSource) => {
  row.status = row.status === "running" ? "stopped" : "running";
  ElMessage.success(`已${row.status === "running" ? "启动" : "停止"}：${row.name}`);
};

const editChannel = (row: DataSource) => {
  console.log(row);
  ElMessage.info("配置功能将在后续版本实现");
};

// 日志弹窗
const showLogsDialog = ref(false);
const currentLogChannel = ref("");
const mockLogs = ref<{ time: string; level: string; message: string }[]>([]);

const viewLogs = (row: DataSource) => {
  currentLogChannel.value = row.name;
  mockLogs.value = [
    { time: `${new Date().toLocaleDateString()} 08:30:15`, level: "INFO", message: "连接检查：正常，服务已就绪。" },
    { time: `${new Date().toLocaleDateString()} 08:35:22`, level: "INFO", message: `成功接收数据，处理条数: ${Math.floor(Math.random() * 100)}` },
    { time: `${new Date().toLocaleDateString()} 08:40:05`, level: "WARN", message: "部分记录缺少关键字段，使用插补策略填充。" },
    { time: `${new Date().toLocaleDateString()} 08:45:11`, level: "INFO", message: "健康同步成功。" },
  ];
  if (row.status === "error") {
    mockLogs.value.push({ time: `${new Date().toLocaleDateString()} 08:50:01`, level: "ERROR", message: "连接设备超时：连接丢失。" });
  }
  showLogsDialog.value = true;
};

// ── 工具函数 ──────────────────────────────────────
const getRowClass = ({ row }: { row: any }) => row.isCategory ? "category-row" : "datasource-row";

const getCategoryStatusText = (children: DataSource[]) => {
  if (!children?.length) return "空";
  if (children.some(c => c.status === "error")) return "有异常";
  if (children.every(c => c.status === "running")) return "全部运行中";
  return "部分停止";
};

const getTypeIcon = (type: string) => ({ mqtt: "📡", websocket: "🔌", webhook: "🔗", tcp: "⚡", http: "🌐", ftp: "📁", cloud: "☁️" } as any)[type] ?? "📄";

const getTypeName = (type: string) => ({ mqtt: "MQTT", websocket: "WebSocket", webhook: "Webhook", tcp: "Socket", http: "HTTP 轮询", ftp: "FTP/SFTP", cloud: "云存储" } as any)[type] ?? type;

const getTypeTag = (type: string) => (["mqtt", "websocket", "webhook", "tcp"].includes(type) ? "success" : "primary");

const getStatusName = (status: string) => ({ running: "运行中", stopped: "已停止", error: "异常" } as any)[status] ?? status;
</script>

<style scoped>
/* ══════════════ 色彩令牌 (全绿色系) ══════════════ */
.data-source-page {
  --eco-forest:        #0d2b1a;   /* 极深森林绿 */
  --eco-forest-mid:    #1b4332;   /* 深森林绿 */
  --eco-pine:          #2d6a4f;   /* 松绿 */
  --eco-moss:          #40916c;   /* 苔藓绿 */
  --eco-fern:          #52b788;   /* 蕨绿 */
  --eco-spring:        #74c69d;   /* 春绿 */
  --eco-leaf:          #95d5b2;   /* 嫩叶绿 */
  --eco-mint:          #b7e4c7;   /* 薄荷绿 */
  --eco-mist:          #d8f3dc;   /* 绿雾 */
  --eco-ice:           #ebfbf0;   /* 冰绿 */
  --eco-surface:       #f2fdf5;   /* 极浅绿底面 */
  --eco-white:         #f8fffe;   /* 绿白 */
  --eco-border:        #74c69d;   /* 中绿边框 */
  --eco-border-light:  #b7e4c7;   /* 浅绿边框 */
  --eco-text-dark:     #0d2b1a;   /* 深文字 */
  --eco-text-mid:      #2d6a4f;   /* 中文字 */
  --eco-text-muted:    #52b788;   /* 淡文字 */

  padding: 28px 32px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--eco-surface);
  background-image:
    radial-gradient(ellipse at 15% 45%, rgba(64, 145, 108, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse at 88% 12%, rgba(116, 198, 157, 0.12) 0%, transparent 45%),
    radial-gradient(ellipse at 55% 88%, rgba(27, 67, 50, 0.07) 0%, transparent 40%);
}

/* ══════════════ 生态背景装饰 ══════════════ */
.eco-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.eco-leaf {
  position: absolute;
  color: var(--eco-moss);
}

.eco-leaf--1 {
  width: 200px;
  height: 200px;
  top: -50px;
  right: 220px;
  transform: rotate(-18deg);
  opacity: 0.09;
}

.eco-leaf--2 {
  width: 130px;
  height: 130px;
  bottom: 50px;
  left: 30px;
  transform: rotate(35deg);
  opacity: 0.07;
}

.eco-leaf--3 {
  width: 90px;
  height: 90px;
  top: 120px;
  left: 260px;
  transform: rotate(-8deg);
  opacity: 0.05;
}

.eco-network-graph {
  position: absolute;
  width: 520px;
  height: 260px;
  top: -10px;
  right: -20px;
  color: var(--eco-moss);
  opacity: 0.55;
}

/* ══════════════ 页面头部 ══════════════ */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1.5px solid var(--eco-border-light);
  position: relative;
  z-index: 1;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.eco-brand-icon {
  width: 52px;
  height: 52px;
  background: linear-gradient(145deg, #ffffff, #e8f8f0);
  border-radius: 13px;
  border: 1.5px solid var(--eco-border);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px;
  box-shadow:
    0 2px 8px rgba(45, 106, 79, 0.18),
    0 0 0 4px rgba(64, 145, 108, 0.10);
  flex-shrink: 0;
}

.eco-brand-icon svg {
  width: 100%;
  height: 100%;
}

.brand-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--eco-forest);
  letter-spacing: 0.4px;
}

.brand-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--eco-pine);
  letter-spacing: 0.2px;
}

/* 生态网络统计徽章 */
.eco-network-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--eco-border-light);
  border-radius: 24px;
  padding: 7px 20px;
  backdrop-filter: blur(8px);
  width: fit-content;
  box-shadow: 0 1px 4px rgba(13, 43, 26, 0.08);
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-value {
  font-size: 17px;
  font-weight: 700;
  color: var(--eco-forest-mid);
  line-height: 1;
}

.stat-item--running .stat-value {
  color: var(--eco-moss);
}

.stat-label {
  font-size: 12px;
  color: var(--eco-text-mid);
}

.stat-sep {
  color: var(--eco-border);
  font-size: 15px;
  user-select: none;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-self: flex-end;
}

/* ══════════════ 按钮 ══════════════ */
.btn-secondary {
  background: rgba(248, 255, 254, 0.95);
  border: 1.5px solid var(--eco-border);
  color: var(--eco-pine);
  font-weight: 500;
  transition: all 0.2s ease;
}
.btn-secondary:hover {
  background: var(--eco-mist);
  border-color: var(--eco-moss);
  color: var(--eco-forest-mid);
}

.btn-primary {
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
  font-weight: 500;
  transition: all 0.25s ease;
}
.btn-primary:hover {
  background: linear-gradient(135deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
  transform: translateY(-1px);
}

/* ══════════════ 表格容器 ══════════════ */
.channel-list {
  background: rgba(248, 255, 254, 0.95);
  border-radius: 12px;
  padding: 4px;
  border: 1px solid var(--eco-border-light);
  box-shadow:
    0 2px 16px rgba(13, 43, 26, 0.08),
    0 1px 4px rgba(64, 145, 108, 0.06);
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

/* ══════════════ 分类行 ══════════════ */
.category-name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.station-marker {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.station-marker svg {
  width: 100%;
  height: 100%;
}

.category-label {
  font-weight: 700;
  color: var(--eco-forest);
  font-size: 14.5px;
  letter-spacing: 0.25px;
}

/* 计数徽章：运行数/总数 */
.count-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 1.5px;
  background: rgba(45, 106, 79, 0.08);
  border: 1px solid rgba(64, 145, 108, 0.30);
  border-radius: 10px;
  padding: 2px 9px;
  line-height: 1;
}

.count-running {
  font-size: 13px;
  font-weight: 700;
  color: var(--eco-moss);
}

.count-sep {
  font-size: 11px;
  color: var(--eco-spring);
  margin: 0 1px;
}

.count-total {
  font-size: 13px;
  font-weight: 500;
  color: var(--eco-pine);
}

.count-unit {
  font-size: 11px;
  color: var(--eco-text-muted);
  margin-left: 3px;
}

.category-status-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--eco-forest-mid);
  background: rgba(216, 243, 220, 0.55);
  padding: 3px 10px;
  border-radius: 10px;
  border: 1px solid rgba(95, 171, 136, 0.25);
  white-space: nowrap;
}

.cat-status-text {
  font-weight: 500;
  font-size: 12.5px;
  color: var(--eco-pine);
}

/* 分类行操作按钟 */
.category-ops {
  display: flex;
  align-items: center;
  gap: 0;
}

.ops-divider {
  color: rgba(64, 145, 108, 0.30);
  font-size: 13px;
  user-select: none;
  margin: 0 2px;
  line-height: 1;
}

/* ══════════════ 数据源行 ══════════════ */
.channel-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
}

.channel-type-icon {
  font-size: 14px;
}

.channel-name {
  font-weight: 500;
  color: #1a3d28;
  font-size: 13.5px;
}

/* ══════════════ 状态 ══════════════ */
.status-cell {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--eco-pine);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--eco-border);
}
.status-dot.running {
  background: var(--eco-moss);
  box-shadow: 0 0 5px rgba(64, 145, 108, 0.65);
  animation: eco-pulse 2.8s ease-in-out infinite;
}
.status-dot.stopped {
  background: var(--eco-spring);
  opacity: 0.55;
}
.status-dot.error {
  background: #b83c2a;
  box-shadow: 0 0 5px rgba(184, 60, 42, 0.55);
}

@keyframes eco-pulse {
  0%, 100% { box-shadow: 0 0 5px rgba(64, 145, 108, 0.65); }
  50%       { box-shadow: 0 0 10px rgba(64, 145, 108, 0.95); }
}

.sync-time {
  color: var(--eco-pine);
  font-size: 12.5px;
  font-family: 'Courier New', monospace;
}

/* ══════════════ 表格 Deep 样式 ══════════════ */
:deep(.el-table th.el-table__cell) {
  background-color: #c9edda !important;
  color: var(--eco-forest-mid);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.3px;
  border-bottom: 1.5px solid var(--eco-border);
  padding: 12px 0;
}

:deep(.el-table) {
  background: transparent;
  border-radius: 8px;
  overflow: hidden;
}
:deep(.el-table tr) {
  background-color: transparent;
}

:deep(.category-row > td) {
  background-color: #e8f5ee !important;
  border-top: 1px solid #c0e4ce;
  border-bottom: 1px solid #c0e4ce;
  padding: 14px 0;
}

:deep(.category-row > td:first-child) {
  border-left: 3px solid var(--eco-moss) !important;
}

:deep(.category-row:first-child > td) {
  border-top: none;
}

:deep(.category-row:hover > td) {
  background-color: #d5ecde !important;
}

:deep(.datasource-row > td) {
  background-color: var(--eco-white) !important;
  border-bottom: 1px dashed #c8e8d4;
}
:deep(.datasource-row:hover > td) {
  background-color: #f0fbf4 !important;
}

:deep(.category-row > td:first-child .cell) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.el-table__expand-icon) {
  color: var(--eco-moss);
  font-size: 14px;
  margin-right: 0;
  flex-shrink: 0;
}
:deep(.el-table__placeholder) {
  width: 25px;
}

/* 类型标签 */
:deep(.el-tag--success) {
  background-color: rgba(64, 145, 108, 0.12);
  color: var(--eco-pine);
  border-color: rgba(64, 145, 108, 0.28);
}
:deep(.el-tag--primary) {
  background-color: rgba(116, 198, 157, 0.16);
  color: var(--eco-forest-mid);
  border-color: rgba(116, 198, 157, 0.35);
}

/* 链接按钮 */
:deep(.el-button.is-link.el-button--primary) {
  color: var(--eco-forest-mid);
}
:deep(.el-button.is-link.el-button--primary:hover) {
  color: var(--eco-forest);
}
:deep(.el-button.is-link.el-button--danger) {
  color: #b44b38;
}
:deep(.el-button.is-link.el-button--danger:hover) {
  color: #902f20;
}

/* ══════════════ 对话框内表单 ══════════════ */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ══════════════ 日志终端 ══════════════ */
.logs-container {
  background: #1a2a1e;
  color: #c8e6c9;
  padding: 16px;
  border-radius: 8px;
  height: 400px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.65;
}

.log-item { margin-bottom: 6px; word-wrap: break-word; }
.log-time { color: #81c784; margin-right: 12px; }
.log-level { font-weight: bold; margin-right: 8px; }
.log-level.info  { color: #a5d6a7; }
.log-level.warn  { color: #ffcc80; }
.log-level.error { color: #ef9a9a; }
.log-message { color: #c8e6c9; }
</style>

<style>
/* ─── 弹窗全局样式 ─── */
.data-source-dialog .el-dialog__header {
  background: linear-gradient(135deg, #e8f8ee 0%, #d5eddc 100%);
  border-bottom: 1px solid #9fd6b4;
  margin-right: 0;
  padding: 16px 20px;
}
.data-source-dialog .el-dialog__title {
  color: #1b4332;
  font-weight: 600;
}
.data-source-dialog .el-dialog__footer {
  border-top: 1px solid #c4e8d0;
  padding: 12px 20px 16px;
}

/* 日志弹窗 */
.logs-dialog .el-dialog__header {
  background: #1a2a1e;
  border-bottom: 1px solid #2d4a32;
  margin-right: 0;
  padding: 14px 20px;
}
.logs-dialog .el-dialog__title {
  color: #95d5b2;
  font-size: 14px;
  font-family: 'Courier New', monospace;
}
.logs-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #95d5b2;
}
</style>
