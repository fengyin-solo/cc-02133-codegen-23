<template>
  <div class="estimator-page">
    <!-- 页面头部 -->
    <section class="page-header">
      <div class="container">
        <h1 class="page-title">物流成本估算器</h1>
        <p class="page-subtitle">
          多选仓储、运输与配送服务，一次提交多组货量、距离与时效条件，批量获取费用测算、预算区间与方案差异
        </p>
      </div>
    </section>

    <section class="section section-light">
      <div class="container estimator-layout">
        <!-- 主区域 -->
        <div class="estimator-main">
          <!-- 输入区 -->
          <div class="card form-card">
            <div class="card-head">
              <h2><el-icon><Operation /></el-icon> 选择服务并填写条件</h2>
              <p>三类服务均可多选，系统将对所选服务自动组合生成全部方案</p>
            </div>

            <ServiceSelector v-model="selection" :errors="selectionErrors" />

            <el-divider content-position="left">
              <span class="divider-text">批量条件（最多 {{ limits.maxRows }} 组）</span>
            </el-divider>

            <ConditionTable v-model:rows="draft.rows" />

            <div class="submit-bar">
              <el-button
                type="primary"
                size="large"
                :icon="Coin"
                :loading="calculating"
                @click="handleSubmit"
              >
                批量测算
              </el-button>
              <el-button size="large" :icon="RefreshRight" @click="handleResetDraft">
                重置表单
              </el-button>
              <span class="submit-tip">
                <el-icon><InfoFilled /></el-icon>
                提交后可在此页继续重试失败项；历史返回已保留有效批次
              </span>
            </div>
          </div>

          <!-- 结果区 -->
          <ResultPanel
            v-if="currentBatch"
            :batch="currentBatch"
            @retry="handleRetry"
          />

          <el-empty v-else description="暂无批次结果，请在上方填写条件后提交测算" />
        </div>

        <!-- 历史侧栏 -->
        <aside class="estimator-side">
          <div class="card history-card">
            <div class="history-head">
              <h3><el-icon><Clock /></el-icon> 历史批次</h3>
              <el-button
                v-if="batches.length"
                type="danger"
                link
                size="small"
                @click="handleClearBatches"
              >
                清空
              </el-button>
            </div>

            <el-empty
              v-if="!batches.length"
              description="暂无历史批次"
              :image-size="60"
            />

            <div
              v-for="b in batches"
              :key="b.id"
              class="history-item"
              :class="{ 'is-active': b.id === currentBatchId }"
              @click="viewBatch(b.id)"
            >
              <div class="history-item-top">
                <span class="history-time">{{ formatTimeShort(b.createdAt) }}</span>
                <el-tag
                  size="small"
                  :type="b.result.stats.failed > 0 ? 'danger' : 'success'"
                  effect="plain"
                >
                  {{ b.result.stats.success }} 成 / {{ b.result.stats.failed }} 败
                </el-tag>
              </div>
              <div class="history-meta">
                {{ b.result.stats.total }} 组条件 · {{ b.result.stats.plans }} 个方案
              </div>
              <div class="history-id">{{ b.id }}</div>
            </div>
          </div>

          <!-- 报价说明 -->
          <div class="card rules-card">
            <h3><el-icon><Document /></el-icon> 测算口径</h3>
            <ul>
              <li>仓储按 1 个计费周（7 天）、体积计费；</li>
              <li>公路零担/铁路/水路按 重量×距离 计费，公路整车按 6.5 元/km 计费（单车上限 30 吨）；</li>
              <li>航空单票限重 1,000 kg；当日达限 500 km 以内；</li>
              <li>预算区间 = 合计费用 ×（1 ± 时效波动），当日时效波动 ±18%，其余 ±8%~12%；</li>
              <li>全程时效超出所选时效要求的方案标记为「不可行」，仍展示费用供对比。</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Coin,
  RefreshRight,
  InfoFilled,
  Operation,
  Clock,
  Document
} from '@element-plus/icons-vue'
import ServiceSelector from './ServiceSelector.vue'
import ConditionTable from './ConditionTable.vue'
import ResultPanel from './ResultPanel.vue'
import { useEstimatorStore } from './useEstimatorStore.js'
import { LIMITS } from './services.js'

const {
  draft,
  batches,
  currentBatchId,
  currentBatch,
  submit,
  retryBatch,
  viewBatch,
  clearBatches,
  resetDraft
} = useEstimatorStore()

const limits = LIMITS
const calculating = ref(false)

// v-model 适配：把 store 的 draft 字段映射成 selection 对象
const selection = computed({
  get: () => ({
    warehouse: draft.value.warehouse,
    transport: draft.value.transport,
    delivery: draft.value.delivery
  }),
  set: (val) => {
    draft.value.warehouse = val.warehouse
    draft.value.transport = val.transport
    draft.value.delivery = val.delivery
  }
})

const selectionErrors = reactive({
  warehouse: '',
  transport: '',
  delivery: ''
})

function validateSelection() {
  const keys = [
    ['warehouse', '请至少选择一项仓储服务'],
    ['transport', '请至少选择一项运输服务'],
    ['delivery', '请至少选择一项配送服务']
  ]
  let ok = true
  for (const [key, msg] of keys) {
    if (draft.value[key].length === 0) {
      selectionErrors[key] = msg
      ok = false
    } else {
      selectionErrors[key] = ''
    }
  }
  return ok
}

function handleSubmit() {
  if (!validateSelection()) {
    ElMessage.warning('请先补全三类服务选择（每类至少一项）')
    return
  }
  if (!draft.value.rows.length) {
    ElMessage.warning('请至少填写一组条件')
    return
  }

  calculating.value = true
  // 同步纯计算，保留 loading 态以反馈“整组提交”动作
  setTimeout(() => {
    const batch = submit()
    calculating.value = false
    const { stats } = batch.result
    if (stats.failed > 0) {
      ElMessage.warning(`测算完成：${stats.success} 组成功，${stats.failed} 组失败，可重试失败项`)
    } else {
      ElMessage.success(`测算完成：共生成 ${stats.plans} 个方案`)
    }
  }, 200)
}

function handleRetry(batchId) {
  const batch = batches.value.find((b) => b.id === batchId)
  if (!batch) return
  const failed = batch.result.rows.filter((r) => r.status === 'failed')
  if (!failed.length) {
    ElMessage.info('该批次没有失败项，可直接调整表单后再次提交')
    return
  }
  retryBatch(batchId)
  ElMessage.info(`已回填 ${failed.length} 组失败条件，修正后重新提交即可，历史批次已保留`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleClearBatches() {
  try {
    await ElMessageBox.confirm('确定清空全部历史批次？此操作不可恢复。', '清空历史', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    clearBatches()
    ElMessage.success('历史批次已清空')
  } catch {
    // 用户取消
  }
}

function handleResetDraft() {
  resetDraft()
  selectionErrors.warehouse = ''
  selectionErrors.transport = ''
  selectionErrors.delivery = ''
}

function formatTimeShort(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style lang="scss" scoped>
.page-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: $spacing-xxl 0;
  text-align: center;
  color: #fff;
}

.page-title {
  font-size: $font-size-xxxl;
  font-weight: 700;
  margin-bottom: $spacing-sm;
}

.page-subtitle {
  font-size: $font-size-base;
  opacity: 0.75;
  max-width: 760px;
  margin: 0 auto;
  line-height: $line-height-loose;
}

.estimator-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: $spacing-lg;
  align-items: start;
}

.card {
  background: $bg-white;
  border-radius: $radius-lg;
  box-shadow: $shadow-sm;
}

.form-card {
  padding: $spacing-lg;
  margin-bottom: $spacing-lg;
}

.card-head {
  margin-bottom: $spacing-md;

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
    margin: 0 0 6px;

    .el-icon {
      color: $primary-color;
    }
  }

  p {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin: 0;
  }
}

.divider-text {
  font-size: $font-size-sm;
  color: $text-regular;
  font-weight: 600;
}

.submit-bar {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-top: $spacing-lg;
  flex-wrap: wrap;
}

.submit-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-xs;
  color: $text-secondary;
}

.estimator-side {
  position: sticky;
  top: 86px;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.history-card,
.rules-card {
  padding: $spacing-md;
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-sm;

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $font-size-base;
    font-weight: 600;
    color: $text-primary;
    margin: 0;

    .el-icon {
      color: $primary-color;
    }
  }
}

.history-item {
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;
  margin-bottom: $spacing-xs;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: $primary-light;
  }

  &.is-active {
    border-color: $primary-color;
    background: rgba($primary-color, 0.04);
  }
}

.history-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-time {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-primary;
}

.history-meta {
  font-size: $font-size-xs;
  color: $text-regular;
  margin-top: 4px;
}

.history-id {
  font-size: 11px;
  color: $text-placeholder;
  font-family: monospace;
  margin-top: 2px;
}

.rules-card {
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $font-size-base;
    font-weight: 600;
    color: $text-primary;
    margin: 0 0 $spacing-sm;

    .el-icon {
      color: $primary-color;
    }
  }

  ul {
    margin: 0;
    padding-left: 18px;

    li {
      font-size: $font-size-xs;
      color: $text-secondary;
      line-height: $line-height-loose;
      margin-bottom: 4px;
    }
  }
}

@media (max-width: $breakpoint-xl) {
  .estimator-layout {
    grid-template-columns: 1fr;
  }

  .estimator-side {
    position: static;
  }
}
</style>
