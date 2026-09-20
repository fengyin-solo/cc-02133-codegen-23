<template>
  <div class="estimator-page">
    <!-- 独立页面头部：与官网共用框架，但不改动任何原页面 -->
    <section class="estimator-hero">
      <div class="hero-inner">
        <div class="hero-left">
          <el-button class="back-btn" text @click="$router.push('/products')">
            <el-icon><ArrowLeft /></el-icon>返回产品服务
          </el-button>
          <h1>物流成本估算器</h1>
          <p>
            多选仓储、运输、配送服务，一次提交多组货量 / 距离 / 时效条件，
            批量生成整组费用测算、预算区间与方案差异。
          </p>
        </div>
        <div class="hero-right">
          <el-button @click="historyOpen = true">
            <el-icon><Clock /></el-icon>历史批次
            <el-badge
              v-if="history.length"
              :value="history.length"
              class="history-badge"
              type="primary"
            />
          </el-button>
        </div>
      </div>
    </section>

    <div class="estimator-container">
      <!-- 第一步：选择服务 -->
      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <span class="step">1</span>选择服务（每类至少 1 项，最多组合 {{ MAX_COMBOS }} 套方案）
          </div>
        </template>
        <ServicePicker :selected="selected" @toggle="toggleService" />
      </el-card>

      <!-- 第二步：批量条件 -->
      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <span class="step">2</span>批量录入条件
            <span class="panel-sub">空值、重复或超出范围的行会被标记为失败项，不影响其他行</span>
          </div>
        </template>
        <ConditionsEditor
          v-model:rows="rows"
          :failed-map="failedMap"
          @add="addRow"
          @remove="removeRow"
          @fill-sample="fillSample"
          @clear="clearRows"
        />
        <div class="submit-bar">
          <el-button
            type="primary"
            size="large"
            :loading="calculating"
            @click="submitBatch"
          >
            <el-icon><DataAnalysis /></el-icon>
            批量估算（{{ rows.length }} 组）
          </el-button>
          <el-button
            v-if="currentBatch && currentBatch.summary.failedCount > 0"
              size="large"
              type="warning"
              plain
              @click="retryFailed"
            >
              <el-icon><RefreshRight /></el-icon>重试失败项
            </el-button>
            <span class="submit-tip">
              有效条件会自动保留；失败项修正后可就地重试
            </span>
          </div>
      </el-card>

      <!-- 第三步：结果 -->
      <el-card v-if="currentBatch" class="panel result-panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <span class="step success">3</span>
            估算结果
            <el-tag v-if="retryNotice" size="small" type="warning" effect="plain" class="retry-tag">
              {{ retryNotice }}
            </el-tag>
          </div>
        </template>
        <BatchResult :batch="currentBatch" @retry="retryFailed" />
      </el-card>

      <el-empty
        v-else
        description="尚未生成批次：选择服务并提交条件后，结果将在此逐条展示"
      />
    </div>

    <!-- 历史批次抽屉 -->
    <el-drawer v-model="historyOpen" title="历史有效批次" size="52%">
      <div class="history-toolbar">
        <span class="history-count">保留最近 {{ history.length }} 个批次</span>
        <el-button size="small" plain :disabled="!history.length" @click="clearHistory">
          <el-icon><Delete /></el-icon>清空历史
        </el-button>
      </div>
      <div class="history-list">
        <BatchResult
          v-for="b in history"
          :key="b.id"
          :batch="b"
          readonly
          class="history-item"
          @load="loadFromHistory"
          @delete="deleteHistory"
        />
        <el-empty v-if="!history.length" description="暂无历史批次" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ServicePicker from '@/components/estimator/ServicePicker.vue'
import ConditionsEditor from '@/components/estimator/ConditionsEditor.vue'
import BatchResult from '@/components/estimator/BatchResult.vue'
import {
  MAX_ROWS,
  estimateBatch,
  mergeRetryResult
} from '@/utils/logisticsPricing.js'

const STORAGE_DRAFT = 'logistics-estimator:draft:v1'
const STORAGE_HISTORY = 'logistics-estimator:history:v1'
const HISTORY_LIMIT = 12
const MAX_COMBOS = 27 // 3x3x3

const emptySelection = () => ({ warehousing: [], transport: [], delivery: [] })
const makeRow = () => ({ id: nextId(), weight: '', distance: '', sla: '' })

let uid = 1
function nextId() {
  return uid++
}

const selected = reactive(emptySelection())
const rows = ref([makeRow()])
const currentBatch = ref(null)
const failedMap = ref(new Map())
const retryNotice = ref('')
const calculating = ref(false)
const history = ref([])
const historyOpen = ref(false)

const comboCount = computed(
  () =>
    selected.warehousing.length *
    selected.transport.length *
    selected.delivery.length
)

function toggleService(groupKey, id) {
  const list = selected[groupKey]
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else if (comboCount.value >= MAX_COMBOS && list.length === 3) {
    ElMessage.warning(`方案数量不能超过 ${MAX_COMBOS} 套`)
    return
  } else list.push(id)
}

function addRow() {
  if (rows.value.length >= MAX_ROWS) {
    ElMessage.warning(`最多一次提交 ${MAX_ROWS} 组条件`)
    return
  }
  rows.value.push(makeRow())
}

function removeRow(idx) {
  rows.value.splice(idx, 1)
}

function clearRows() {
  rows.value = [makeRow()]
  failedMap.value = new Map()
}

function fillSample() {
  rows.value = [
    { id: nextId(), weight: '10', distance: '800', sla: '48' },
    { id: nextId(), weight: '2.5', distance: '1200', sla: '12' },
    { id: nextId(), weight: '30', distance: '300', sla: '96' },
    { id: nextId(), weight: '0.8', distance: '150', sla: '6' }
  ]
  failedMap.value = new Map()
  if (!selected.warehousing.length) selected.warehousing.push('standard')
  if (!selected.transport.length) selected.transport.push('road')
  if (!selected.delivery.length) selected.delivery.push('standard')
}

function persistDraft() {
  try {
    localStorage.setItem(
      STORAGE_DRAFT,
      JSON.stringify({
        selected,
        rows: rows.value,
        batch: currentBatch.value
      })
    )
  } catch {
    /* 存储不可用时静默降级 */
  }
}

function saveHistory(batch) {
  history.value = [batch, ...history.value.filter((b) => b.id !== batch.id)].slice(
    0,
    HISTORY_LIMIT
  )
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.value))
  } catch {
    /* ignore */
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY)
    if (raw) history.value = JSON.parse(raw) || []
  } catch {
    history.value = []
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_DRAFT)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (draft?.selected) Object.assign(selected, draft.selected)
    if (Array.isArray(draft?.rows) && draft.rows.length) {
      // 恢复的行重新分配运行时 id
      rows.value = draft.rows.map((r) => ({
        id: nextId(),
        weight: r.weight ?? '',
        distance: r.distance ?? '',
        sla: r.sla ?? ''
      }))
    }
    if (draft?.batch?.ok) {
      currentBatch.value = draft.batch
      rebuildFailedMap(draft.batch)
    }
  } catch {
    /* 草稿损坏时忽略 */
  }
}

function rebuildFailedMap(batch) {
  const map = new Map()
  if (!batch?.items) {
    failedMap.value = map
    return
  }
  // 优先按行唯一 id 对齐，行号作为回退（历史取回等场景）
  batch.items
    .filter((i) => i.status === 'failed')
    .forEach((i) => {
      const byId = rows.value.find((r) => r.id === i.rowId)
      const byNo = rows.value[i.rowNo - 1]
      const row = byId || byNo
      if (row) map.set(row.id, i.errors)
    })
  failedMap.value = map
}

function scrollToResult() {
  setTimeout(() => {
    document
      .querySelector('.result-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 80)
}

function submitBatch() {
  if (comboCount.value === 0) {
    const missing = ['仓储服务', '干线运输', '末端配送'].filter(
      (_, i) => Object.values(selected)[i].length === 0
    )
    ElMessage.error(`请先选择服务：${missing.join('、')}`)
    return
  }

  calculating.value = true
  setTimeout(() => {
    const result = estimateBatch(
      {
        warehousing: selected.warehousing,
        transport: selected.transport,
        delivery: selected.delivery
      },
      rows.value
    )

    currentBatch.value = result
    retryNotice.value = ''
    rebuildFailedMap(result)

    const { successCount, failedCount } = result.summary
    if (failedCount === 0) {
      ElMessage.success(`批次 ${result.id} 已生成：${successCount} 组条件全部成功`)
      saveHistory(result)
    } else {
      ElMessage.warning(
        `批次 ${result.id}：成功 ${successCount} 组，失败 ${failedCount} 组，请修正高亮行后重试`
      )
      if (successCount > 0) saveHistory(result)
    }
    calculating.value = false
    scrollToResult()
  }, 200)
}

/** 仅重算批次中的失败项，成功项原样保留 */
function retryFailed() {
  const batch = currentBatch.value
  if (!batch) return
  const failedItems = batch.items.filter((i) => i.status === 'failed')
  if (!failedItems.length) {
    ElMessage.info('当前批次没有失败项')
    return
  }

  // 取出失败行在编辑器中的当前内容，带上批次行号与唯一 id 供合并对齐
  const retryRows = currentBatch.value.items
    .filter((i) => i.status === 'failed')
    .map((fi) => {
      const editorRow =
        rows.value.find((r) => r.id === fi.rowId) ?? rows.value[fi.rowNo - 1]
      if (!editorRow) return null
      return { ...editorRow, rowId: editorRow.id, __rowNo: fi.rowNo }
    })
    .filter(Boolean)

  const retryResult = estimateBatch(batch.selected, retryRows)
  if (!retryResult.ok) return

  const merged = mergeRetryResult(batch, retryResult)
  currentBatch.value = merged
  rebuildFailedMap(merged)

  if (merged.summary.failedCount === 0) {
    retryNotice.value = `重试后全部通过（由批次 ${batch.id} 修正生成）`
    ElMessage.success('重试完成：所有条件均已通过')
  } else {
    retryNotice.value = `已保留 ${merged.summary.successCount} 组有效结果，仍有 ${merged.summary.failedCount} 组失败`
    ElMessage.warning(`重试完成：仍有 ${merged.summary.failedCount} 组失败项`)
  }
  saveHistory(merged)
  scrollToResult()
}

function loadFromHistory(batch) {
  currentBatch.value = batch
  Object.assign(selected, emptySelection(), batch.selected)
  rows.value = batch.items.map((i) => ({
    id: nextId(),
    weight: i.raw?.weight ?? i.data?.weight ?? '',
    distance: i.raw?.distance ?? i.data?.distance ?? '',
    sla: i.raw?.sla ?? i.data?.sla ?? ''
  }))
  rebuildFailedMap(batch)
  retryNotice.value = `已从历史批次 ${batch.id} 取回，可直接修改后重新提交`
  historyOpen.value = false
  scrollToResult()
  ElMessage.success('历史批次已取回编辑器，原产品页面不受影响')
}

async function deleteHistory(id) {
  try {
    await ElMessageBox.confirm('确定删除该历史批次？此操作不可撤销。', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  history.value = history.value.filter((b) => b.id !== id)
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.value))
  } catch {
    /* ignore */
  }
  ElMessage.success('已删除')
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm('确定清空全部历史批次？', '清空确认', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  history.value = []
  try {
    localStorage.removeItem(STORAGE_HISTORY)
  } catch {
    /* ignore */
  }
  ElMessage.success('历史已清空')
}

watch([rows, selected, currentBatch], persistDraft, { deep: true })

onMounted(() => {
  loadHistory()
  loadDraft()
})
</script>

<style lang="scss" scoped>
.estimator-page {
  min-height: calc(100vh - 70px);
  background: #f5f7fa;
}

.estimator-hero {
  background: linear-gradient(120deg, #096dd9 0%, #1890ff 55%, #40a9ff 100%);
  color: #fff;
  padding: 28px 0 34px;
}

.hero-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.back-btn {
  color: rgba(255, 255, 255, 0.85);
  padding: 0;
  margin-bottom: 12px;

  &:hover {
    color: #fff;
  }
}

.hero-left h1 {
  font-size: 28px;
  margin: 0 0 8px;
}

.hero-left p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.9);
  max-width: 720px;
}

.hero-right .el-button {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;

  &:hover {
    background: rgba(255, 255, 255, 0.24);
  }
}

.history-badge {
  margin-left: 4px;
}

.estimator-container {
  max-width: 1100px;
  margin: -18px auto 48px;
  padding: 0 24px;
  position: relative;
}

.panel {
  margin-bottom: 18px;
  border-radius: 12px;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.panel-sub {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #1890ff;
  color: #fff;
  font-size: 13px;

  &.success {
    background: #52c41a;
  }
}

.submit-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.submit-tip {
  font-size: 12px;
  color: #909399;
}

.retry-tag {
  margin-left: 4px;
}

.result-panel {
  margin-bottom: 0;
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 12px;
}

.history-count {
  font-size: 12px;
  color: #909399;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
