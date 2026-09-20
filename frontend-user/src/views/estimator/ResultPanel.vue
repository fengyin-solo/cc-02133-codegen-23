<template>
  <div v-if="batch" class="result-panel">
    <!-- 批次摘要 -->
    <div class="batch-summary card">
      <div class="summary-head">
        <div>
          <h3 class="summary-title">
            <el-icon><DataAnalysis /></el-icon>
            批次结果
            <span class="batch-id">{{ batch.id }}</span>
          </h3>
          <p class="summary-time">提交时间：{{ formatTime(batch.createdAt) }}</p>
        </div>
        <el-button type="primary" plain :icon="RefreshLeft" @click="emit('retry', batch.id)">
          重试失败项
        </el-button>
      </div>

      <div class="summary-chips">
        <span class="chip-label">已选服务：</span>
        <el-tag
          v-for="name in selectionNames"
          :key="name"
          size="small"
          type="info"
          effect="plain"
          class="svc-chip"
        >
          {{ name }}
        </el-tag>
      </div>

      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-num">{{ batch.result.stats.total }}</div>
          <div class="stat-label">条件组数</div>
        </div>
        <div class="stat-item stat-success">
          <div class="stat-num">{{ batch.result.stats.success }}</div>
          <div class="stat-label">测算成功</div>
        </div>
        <div class="stat-item" :class="{ 'stat-danger': batch.result.stats.failed > 0 }">
          <div class="stat-num">{{ batch.result.stats.failed }}</div>
          <div class="stat-label">失败项</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">{{ batch.result.stats.plans }}</div>
          <div class="stat-label">生成方案</div>
        </div>
        <div class="stat-item" :class="{ 'stat-warning': infeasibleCount > 0 }">
          <div class="stat-num">{{ infeasibleCount }}</div>
          <div class="stat-label">不满足时效/限制</div>
        </div>
      </div>
    </div>

    <!-- 失败项汇总 -->
    <el-alert
      v-if="failedRows.length"
      type="error"
      :closable="false"
      show-icon
      class="fail-alert"
    >
      <template #title>
        {{ failedRows.length }} 组条件测算失败，点击右上角「重试失败项」可回填修正后重新提交
      </template>
      <div class="fail-list">
        <div v-for="row in failedRows" :key="row.index" class="fail-item">
          <span class="fail-index">第 {{ row.index + 1 }} 组：</span>
          <el-tag
            v-for="(e, i) in row.errors"
            :key="i"
            type="danger"
            size="small"
            effect="light"
            class="fail-tag"
          >
            {{ e }}
          </el-tag>
        </div>
      </div>
    </el-alert>

    <!-- 成功项逐条展示 -->
    <el-collapse v-model="active" class="row-collapse">
      <el-collapse-item
        v-for="row in successRows"
        :key="row.index"
        :name="row.index"
      >
        <template #title>
          <div class="row-title">
            <span class="row-badge">第 {{ row.index + 1 }} 组</span>
            <span class="row-cond">
              {{ row.value.weight }} kg · {{ row.value.volume }} m³ ·
              {{ row.value.distance }} km · {{ slaLabel(row.value.sla) }}
            </span>
            <el-tag size="small" type="success" effect="plain">
              {{ row.feasibleCount }}/{{ row.plans.length }} 个方案可行
            </el-tag>
          </div>
        </template>

        <el-table :data="row.plans" border size="small" class="plan-table">
          <el-table-column label="方案（仓储 / 运输 / 配送）" min-width="220">
            <template #default="{ row: plan }">
              <div class="plan-name">
                <span>{{ plan.warehouseName }}</span>
                <el-icon class="plan-arrow"><Right /></el-icon>
                <span>{{ plan.transportName }}</span>
                <el-icon class="plan-arrow"><Right /></el-icon>
                <span>{{ plan.deliveryName }}</span>
              </div>
              <div class="plan-tags">
                <el-tag v-if="plan.key === row.recommendedKey" type="success" size="small">
                  推荐
                </el-tag>
                <el-tag v-if="plan.isCheapest" type="warning" size="small" effect="plain">
                  最低价
                </el-tag>
                <el-tag v-if="plan.isFastest" type="primary" size="small" effect="plain">
                  最快
                </el-tag>
                <el-tag v-if="!plan.feasible" type="danger" size="small">
                  不可行
                </el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="仓储费" width="100" align="right">
            <template #default="{ row: plan }">{{ formatMoney(plan.fees.warehouse) }}</template>
          </el-table-column>
          <el-table-column label="运输费" width="100" align="right">
            <template #default="{ row: plan }">{{ formatMoney(plan.fees.transport) }}</template>
          </el-table-column>
          <el-table-column label="配送费" width="100" align="right">
            <template #default="{ row: plan }">{{ formatMoney(plan.fees.delivery) }}</template>
          </el-table-column>
          <el-table-column label="费用合计" width="115" align="right">
            <template #default="{ row: plan }">
              <span class="total-money" :class="{ muted: !plan.feasible }">
                {{ formatMoney(plan.total) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="预算区间（±波动）" min-width="170">
            <template #default="{ row: plan }">
              <div>{{ formatMoney(plan.budget.low) }} ~ {{ formatMoney(plan.budget.high) }}</div>
              <div class="tolerance">波动 ±{{ Math.round(plan.budget.tolerance * 100) }}%</div>
            </template>
          </el-table-column>
          <el-table-column label="全程时效" width="110" align="center">
            <template #default="{ row: plan }">
              <div>{{ plan.totalDays }} 天</div>
              <div class="tolerance">干运 {{ plan.linehaulDays }} + 末端 {{ plan.deliveryDays }}</div>
            </template>
          </el-table-column>
          <el-table-column label="方案差异（对最低价）" min-width="150">
            <template #default="{ row: plan }">
              <template v-if="plan.feasible && plan.delta !== null">
                <div :class="plan.delta > 0 ? 'delta-up' : 'delta-eq'">
                  {{ plan.delta === 0 ? '最低价基准' : `+${formatMoney(plan.delta)}` }}
                </div>
                <div v-if="plan.deltaPct !== null && plan.deltaPct > 0" class="tolerance">
                  +{{ plan.deltaPct }}%
                </div>
                <div v-if="plan.daysDelta !== null && plan.daysDelta > 0" class="tolerance">
                  慢 {{ plan.daysDelta }} 天
                </div>
                <div v-else-if="plan.daysDelta === 0" class="tolerance">时效相同</div>
              </template>
              <div v-else-if="!plan.feasible" class="infeasible-reasons">
                <div v-for="(r, i) in plan.reasons" :key="i">· {{ r }}</div>
              </div>
              <span v-else class="tolerance">—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RefreshLeft, DataAnalysis } from '@element-plus/icons-vue'
import { SERVICE_CATALOG, SLA_OPTIONS, formatMoney } from './services.js'

const props = defineProps({
  batch: { type: Object, required: true }
})
const emit = defineEmits(['retry'])

const active = ref(
  props.batch.result.rows.filter((r) => r.status === 'success').map((r) => r.index).slice(0, 1)
)

const failedRows = computed(() => props.batch.result.rows.filter((r) => r.status === 'failed'))
const successRows = computed(() => props.batch.result.rows.filter((r) => r.status === 'success'))

const infeasibleCount = computed(
  () =>
    props.batch.result.stats.plans - props.batch.result.stats.feasiblePlans
)

const slaMap = Object.fromEntries(SLA_OPTIONS.map((s) => [s.id, s.label]))
const slaLabel = (id) => slaMap[id] || id

const selectionNames = computed(() => {
  const nameOf = (cat, id) =>
    (SERVICE_CATALOG[cat].find((s) => s.id === id) || {}).name
  const sel = props.batch.selection
  return [
    ...sel.warehouse.map((id) => nameOf('warehouse', id)),
    ...sel.transport.map((id) => nameOf('transport', id)),
    ...sel.delivery.map((id) => nameOf('delivery', id))
  ].filter(Boolean)
})

function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<style lang="scss" scoped>
.card {
  background: $bg-white;
  border-radius: $radius-lg;
  box-shadow: $shadow-sm;
}

.batch-summary {
  padding: $spacing-lg;
  margin-bottom: $spacing-md;
}

.summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-md;
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
  margin: 0;

  .el-icon {
    color: $primary-color;
  }
}

.batch-id {
  font-size: $font-size-xs;
  color: $text-secondary;
  font-weight: 400;
  font-family: monospace;
}

.summary-time {
  font-size: $font-size-xs;
  color: $text-secondary;
  margin: 6px 0 0;
}

.summary-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: $spacing-sm 0 $spacing-md;
}

.chip-label {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: $spacing-sm;
}

.stat-item {
  text-align: center;
  background: $bg-color;
  border-radius: $radius-md;
  padding: $spacing-sm 0;

  &.stat-success .stat-num {
    color: $success-color;
  }

  &.stat-danger {
    background: rgba($danger-color, 0.08);
    .stat-num {
      color: $danger-color;
    }
  }

  &.stat-warning {
    background: rgba($warning-color, 0.08);
    .stat-num {
      color: $warning-color;
    }
  }
}

.stat-num {
  font-size: $font-size-xxl;
  font-weight: 700;
  color: $primary-color;
  line-height: 1.2;
}

.stat-label {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.fail-alert {
  margin-bottom: $spacing-md;
}

.fail-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fail-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.fail-index {
  font-size: $font-size-sm;
  font-weight: 600;
}

.fail-tag {
  margin-right: 4px;
}

.row-collapse {
  background: transparent;
  border: none;

  :deep(.el-collapse-item__header) {
    background: $bg-white;
    border-radius: $radius-md;
    padding: 0 $spacing-md;
    margin-bottom: $spacing-sm;
    border: 1px solid $border-light;
    font-size: $font-size-sm;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
  }

  :deep(.el-collapse-item__content) {
    padding: 0 0 $spacing-md;
  }
}

.row-title {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.row-badge {
  font-weight: 600;
  color: $primary-color;
}

.row-cond {
  color: $text-regular;
}

.plan-table {
  border-radius: $radius-md;
}

.plan-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: $font-size-sm;
  color: $text-primary;
  flex-wrap: wrap;
}

.plan-arrow {
  color: $text-placeholder;
  font-size: 12px;
}

.plan-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.total-money {
  font-weight: 700;
  color: $primary-dark;

  &.muted {
    color: $text-placeholder;
    text-decoration: line-through;
  }
}

.tolerance {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.delta-up {
  color: $warning-color;
  font-weight: 600;
  font-size: $font-size-sm;
}

.delta-eq {
  color: $success-color;
  font-weight: 600;
  font-size: $font-size-sm;
}

.infeasible-reasons {
  font-size: $font-size-xs;
  color: $danger-color;
  line-height: $line-height-base;
}

@media (max-width: $breakpoint-md) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .summary-head {
    flex-direction: column;
  }
}
</style>
