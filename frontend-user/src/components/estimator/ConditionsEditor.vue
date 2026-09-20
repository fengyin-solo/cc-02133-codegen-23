<template>
  <div class="conditions-editor">
    <div class="editor-head">
      <div class="head-title">
        条件组
        <span class="head-count">{{ rows.length }} / {{ MAX_ROWS }} 组</span>
      </div>
      <div class="head-actions">
        <el-button size="small" plain @click="emit('fill-sample')">
          <el-icon><MagicStick /></el-icon>填入示例
        </el-button>
        <el-button size="small" plain :disabled="!rows.length" @click="emit('clear')">
          <el-icon><Delete /></el-icon>清空
        </el-button>
      </div>
    </div>

    <div class="range-hint">
      允许范围：货量 {{ LIMITS.weight.min }}~{{ LIMITS.weight.max }} 吨，
      距离 {{ LIMITS.distance.min }}~{{ LIMITS.distance.max }} 公里，
      时效 {{ LIMITS.sla.min }}~{{ LIMITS.sla.max }} 小时
    </div>

    <div class="rows-wrap">
      <div
        v-for="(row, idx) in rows"
        :key="row.id"
        class="condition-row"
        :class="{ 'is-failed': failedMap.has(row.id) }"
      >
        <span class="row-no">#{{ idx + 1 }}</span>

        <el-input
          v-model="row.weight"
          size="default"
          placeholder="货量(吨)"
          class="cell"
        />
        <el-input
          v-model="row.distance"
          size="default"
          placeholder="距离(公里)"
          class="cell"
        />
        <el-input
          v-model="row.sla"
          size="default"
          placeholder="时效(小时)"
          class="cell"
        />

        <el-button
          class="row-del"
          link
          type="danger"
          :disabled="rows.length <= 1"
          @click="emit('remove', idx)"
        >
          <el-icon><Close /></el-icon>
        </el-button>

        <div v-if="failedMap.has(row.id)" class="row-errors">
          <el-icon><WarningFilled /></el-icon>
          <span v-for="(msg, i) in failedMap.get(row.id)" :key="i" class="error-tag">
            {{ msg }}
          </span>
        </div>
      </div>
    </div>

    <el-button
      class="add-btn"
      long
      plain
      :disabled="rows.length >= MAX_ROWS"
      @click="emit('add')"
    >
      <el-icon><Plus /></el-icon>
      {{ rows.length >= MAX_ROWS ? `最多 ${MAX_ROWS} 组条件` : '添加一组条件' }}
    </el-button>
  </div>
</template>

<script setup>
import { LIMITS, MAX_ROWS } from '@/utils/logisticsPricing.js'

defineProps({
  rows: { type: Array, required: true },
  failedMap: { type: Map, required: true }
})
const emit = defineEmits(['add', 'remove', 'fill-sample', 'clear'])
</script>

<style lang="scss" scoped>
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.head-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.head-count {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 8px;
}

.range-hint {
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.rows-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.condition-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.2s ease, background 0.2s ease;

  &.is-failed {
    border-color: #f5222d;
    background: #fff7f7;
  }
}

.row-no {
  flex: 0 0 30px;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  text-align: center;
}

.cell {
  flex: 1;
  min-width: 0;
}

.row-del {
  flex: 0 0 auto;
}

.row-errors {
  position: absolute;
  top: 100%;
  left: 10px;
  z-index: 2;
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 10px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  font-size: 12px;
  color: #cf1322;

  .el-icon {
    margin-top: 2px;
  }
}

.error-tag {
  white-space: nowrap;
}

.add-btn {
  margin-top: 4px;
}
</style>
