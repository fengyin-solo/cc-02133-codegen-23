<template>
  <div class="batch-result" :class="{ readonly }">
    <!-- 批次概览 -->
    <div class="batch-head">
      <div class="head-main">
        <span class="batch-id">{{ batch.id }}</span>
        <el-tag size="small" type="success" effect="light">
          成功 {{ batch.summary.successCount }}
        </el-tag>
        <el-tag
          size="small"
          :type="batch.summary.failedCount ? 'danger' : 'info'"
          effect="light"
        >
          失败 {{ batch.summary.failedCount }}
        </el-tag>
        <el-tag size="small" type="info" effect="plain">
          {{ batch.comboCount }} 套方案/组
        </el-tag>
        <span v-if="batch.createdAt" class="batch-time">{{ formatTime(batch.createdAt) }}</span>
      </div>
      <div class="head-actions">
        <el-button
          v-if="!readonly && batch.summary.failedCount > 0"
          size="small"
          type="warning"
          plain
          @click="emit('retry', batch)"
        >
          <el-icon><RefreshRight /></el-icon>重试失败项（{{ batch.summary.failedCount }}）
        </el-button>
        <el-button
          v-if="readonly"
          size="small"
          type="primary"
          plain
          @click="emit('load', batch)"
        >
          <el-icon><EditPen /></el-icon>取回编辑器
        </el-button>
        <el-button
          v-if="readonly"
          size="small"
          type="danger"
          plain
          @click="emit('delete', batch.id)"
        >
          <el-icon><Delete /></el-icon>删除
        </el-button>
      </div>
    </div>

    <!-- 选择的服务 -->
    <div class="selected-line">
      <span v-for="group in SERVICE_GROUPS" :key="group.key" class="selected-group">
        <em>{{ group.label }}</em>
        <el-tag
          v-for="id in batch.selected[group.key]"
          :key="id"
          size="small"
          effect="plain"
        >
          {{ nameOf(group.key, id) }}
        </el-tag>
      </span>
    </div>

    <!-- 逐条结果 -->
    <div class="items">
      <div
        v-for="item in batch.items"
        :key="`${item.rowNo}-${item.rowId}`"
        class="result-item"
        :class="item.status"
      >
        <template v-if="item.status === 'failed'">
          <div class="item-head">
            <span class="row-no">条件 {{ item.rowNo }}</span>
            <el-tag size="small" type="danger">失败</el-tag>
            <span class="cond-chip">
              货量 {{ show(item.raw.weight) || '—' }} · 距离
              {{ show(item.raw.distance) || '—' }} · 时效
              {{ show(item.raw.sla) || '—' }}
            </span>
          </div>
          <ul class="fail-list">
            <li v-for="(msg, i) in item.errors" :key="i">
              <el-icon><CircleCloseFilled /></el-icon>{{ msg }}
            </li>
          </ul>
        </template>

        <template v-else>
          <div class="item-head">
            <span class="row-no">条件 {{ item.rowNo }}</span>
            <el-tag size="small" type="success">成功</el-tag>
            <span class="cond-chip">
              {{ item.data.weight }} 吨 · {{ item.data.distance }} 公里 · 时效
              {{ item.data.sla }} 小时
            </span>
            <el-tag
              v-if="item.feasibleCount === 0"
              size="small"
              type="danger"
              effect="dark"
            >
              无方案满足时效
            </el-tag>
            <el-tag
              v-else-if="item.feasibleCount < item.plans.length"
              size="small"
              type="warning"
            >
              {{ item.feasibleCount }}/{{ item.plans.length }} 套满足时效
            </el-tag>
          </div>

            <el-table :data="item.plans" size="small" class="plans-table" stripe>
              <el-table-column label="仓储 / 运输 / 配送方案" min-width="220">
                <template #default="{ row }">
                  <span class="plan-name">
                    {{ row.warehousingName }} · {{ row.transportName }} · {{ row.deliveryName }}
                  </span>
                  <el-tag
                    v-if="row.isCheapestFeasible"
                    size="small"
                    type="success"
                    effect="dark"
                    class="cheap-tag"
                  >
                    最省可行
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="仓储费" width="100" align="right">
                <template #default="{ row }">{{ formatMoney(row.fees.warehousing) }}</template>
              </el-table-column>
              <el-table-column label="运输费" width="110" align="right">
                <template #default="{ row }">{{ formatMoney(row.fees.transport) }}</template>
              </el-table-column>
              <el-table-column label="配送费" width="100" align="right">
                <template #default="{ row }">{{ formatMoney(row.fees.delivery) }}</template>
              </el-table-column>
              <el-table-column label="费用测算合计" width="130" align="right">
                <template #default="{ row }">
                  <strong :class="{ cheap: row.isCheapestFeasible }">
                    {{ formatMoney(row.total) }}
                  </strong>
                </template>
              </el-table-column>
              <el-table-column label="方案差异" width="120" align="center">
                <template #default="{ row }">
                  <span v-if="row.delta === 0" class="diff-zero">基准（最低）</span>
                  <span v-else class="diff-more">
                    +{{ formatMoney(row.delta) }}<small> / +{{ row.deltaPct }}%</small>
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="所需时效" width="110" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.feasible ? 'success' : 'danger'" effect="plain">
                    {{ row.requiredHours }}h · {{ row.feasible ? '可达' : '超时' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>

            <div class="budget-line">
              <span class="budget-label">
                <el-icon><Money /></el-icon>预算区间
              </span>
              <strong>
                {{ formatMoney(item.budget.low) }} ~ {{ formatMoney(item.budget.high) }}
              </strong>
              <el-tooltip
                v-if="item.budget.degraded"
                content="无方案满足指定时效，区间按理论费用（含浮动）给出，建议放宽时效后重试"
                placement="top"
              >
                <el-icon class="warn-icon"><WarningFilled /></el-icon>
              </el-tooltip>
              <span class="budget-note">下限=最低可行价×0.95，上限=最高可行价×1.08</span>
            </div>
        </template>
      </div>
    </div>

    <!-- 整组汇总 -->
    <div v-if="batch.summary.successCount > 0" class="aggregate-bar">
      <span class="agg-label">整组有效批次预算合计</span>
      <span class="agg-value">
        {{ formatMoney(batch.aggregate.low) }} ~ {{ formatMoney(batch.aggregate.high) }}
      </span>
      <span class="agg-note">共 {{ batch.summary.successCount }} 组有效条件</span>
    </div>
  </div>
</template>

<script setup>
import {
  SERVICE_GROUPS,
  findService,
  formatMoney,
  formatTime
} from '@/utils/logisticsPricing.js'

defineProps({
  batch: { type: Object, required: true },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['retry', 'load', 'delete'])

function nameOf(groupKey, id) {
  return findService(groupKey, id)?.name || id
}

function show(v) {
  return v === null || v === undefined || String(v).trim() === ''
    ? ''
    : String(v).trim()
}
</script>

<style lang="scss" scoped>
.batch-result {
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: #fff;
  padding: 16px 18px;
}

.batch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-id {
  font-size: 13px;
  font-weight: 700;
  color: #096dd9;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.batch-time {
  font-size: 12px;
  color: #909399;
  margin-left: 4px;
}

.selected-line {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 14px;
}

.selected-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  em {
    font-style: normal;
    font-size: 12px;
    color: #909399;
  }
}

.items {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-item {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 12px 14px;

  &.failed {
    border-color: #ffccc7;
    background: #fff8f8;
  }
}

.item-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.row-no {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
}

.cond-chip {
  font-size: 12px;
  color: #606266;
}

.fail-list {
  margin: 0;
  padding-left: 4px;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #cf1322;
    line-height: 1.9;
  }
}

.plans-table {
  margin: 4px 0 8px;
}

.plan-name {
  font-size: 13px;
  color: #303133;
}

.cheap-tag {
  margin-left: 8px;
}

strong.cheap {
  color: #389e0d;
}

.diff-zero {
  font-size: 12px;
  color: #389e0d;
}

.diff-more {
  font-size: 12px;
  color: #fa8c16;
  font-weight: 600;

  small {
    color: #c46a10;
    font-weight: 400;
  }
}

.budget-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  padding-top: 8px;
  border-top: 1px dashed #e4e7ed;

  strong {
    color: #096dd9;
    font-size: 15px;
  }
}

.budget-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #606266;

  .el-icon {
    color: #faad14;
  }
}

.warn-icon {
  color: #faad14;
}

.budget-note {
  font-size: 12px;
  color: #c0c4cc;
}

.aggregate-bar {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f7ff 100%);
  border: 1px solid #91d5ff;
  flex-wrap: wrap;
}

.agg-label {
  font-size: 14px;
  font-weight: 600;
  color: #096dd9;
}

.agg-value {
  font-size: 20px;
  font-weight: 800;
  color: #096dd9;
}

.agg-note {
  font-size: 12px;
  color: #606266;
}
</style>
