<template>
  <div class="condition-table">
    <el-table :data="rows" border size="default" class="cond-el-table">
      <el-table-column type="index" label="#" width="50" align="center" />
      <el-table-column label="货量（kg）" min-width="150">
        <template #default="{ row }">
          <el-input
            v-model="row.weight"
            placeholder="0 ~ 30,000"
            clearable
            @keyup.enter.prevent="addRow"
          />
        </template>
      </el-table-column>
      <el-table-column label="体积（m³）" min-width="140">
        <template #default="{ row }">
          <el-input
            v-model="row.volume"
            placeholder="0 ~ 200"
            clearable
            @keyup.enter.prevent="addRow"
          />
        </template>
      </el-table-column>
      <el-table-column label="运输距离（km）" min-width="150">
        <template #default="{ row }">
          <el-input
            v-model="row.distance"
            placeholder="0 ~ 6,000"
            clearable
            @keyup.enter.prevent="addRow"
          />
        </template>
      </el-table-column>
      <el-table-column label="时效要求" min-width="160">
        <template #default="{ row }">
          <el-select v-model="row.sla" placeholder="选择时效" style="width: 100%">
            <el-option
              v-for="opt in slaOptions"
              :key="opt.id"
              :label="opt.label"
              :value="opt.id"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ $index }">
          <el-button
            type="danger"
            link
            :disabled="rows.length <= 1"
            @click="removeRow($index)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-actions">
      <el-button type="primary" plain :icon="Plus" :disabled="rows.length >= maxRows" @click="addRow">
        添加一组条件
      </el-button>
      <span class="row-count">
        当前 {{ rows.length }} 组 / 上限 {{ maxRows }} 组
      </span>
    </div>
  </div>
</template>

<script setup>
import { Plus } from '@element-plus/icons-vue'
import { SLA_OPTIONS, LIMITS } from './services.js'

const props = defineProps({
  rows: { type: Array, required: true }
})
const emit = defineEmits(['update:rows'])

const slaOptions = SLA_OPTIONS
const maxRows = LIMITS.maxRows

function emitRows(next) {
  emit('update:rows', next)
}

function addRow() {
  if (props.rows.length >= maxRows) return
  emitRows([
    ...props.rows,
    { weight: '', volume: '', distance: '', sla: 'standard' }
  ])
}

function removeRow(index) {
  if (props.rows.length <= 1) return
  emitRows(props.rows.filter((_, i) => i !== index))
}
</script>

<style lang="scss" scoped>
.cond-el-table {
  border-radius: $radius-md;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-top: $spacing-sm;
}

.row-count {
  font-size: $font-size-xs;
  color: $text-secondary;
}
</style>
