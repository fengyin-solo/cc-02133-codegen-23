<template>
  <div class="service-picker">
    <div v-for="group in SERVICE_GROUPS" :key="group.key" class="service-group">
      <div class="group-head">
        <span class="group-title">
          <el-icon><component :is="iconOf(group.key)" /></el-icon>
          {{ group.label }}
        </span>
        <span class="group-hint">可多选，{{ selected[group.key].length }} 项已选</span>
      </div>
      <div class="option-grid">
        <button
          v-for="opt in group.options"
          :key="opt.id"
          type="button"
          class="option-card"
          :class="{ active: selected[group.key].includes(opt.id) }"
          @click="toggle(group.key, opt.id)"
        >
          <span class="check-dot">
            <el-icon v-if="selected[group.key].includes(opt.id)"><Check /></el-icon>
          </span>
          <span class="option-name">{{ opt.name }}</span>
          <span class="option-desc">{{ opt.desc }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { SERVICE_GROUPS } from '@/utils/logisticsPricing.js'

defineProps({
  selected: {
    type: Object,
    required: true
  }
})
const emit = defineEmits(['toggle'])

const ICONS = {
  warehousing: 'Box',
  transport: 'Van',
  delivery: 'Position'
}
const iconOf = (key) => ICONS[key] || 'Goods'

function toggle(groupKey, id) {
  emit('toggle', groupKey, id)
}
</script>

<style lang="scss" scoped>
.service-group {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  .el-icon {
    color: #1890ff;
  }
}

.group-hint {
  font-size: 12px;
  color: #909399;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.option-card {
  position: relative;
  text-align: left;
  border: 1.5px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  padding: 12px 14px 12px 38px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;

  &:hover {
    border-color: #40a9ff;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.12);
  }

  &.active {
    border-color: #1890ff;
    background: #f0f7ff;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.16);
  }
}

.check-dot {
  position: absolute;
  left: 12px;
  top: 14px;
  width: 16px;
  height: 16px;
  border: 1.5px solid #c0c4cc;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;

  .option-card.active & {
    background: #1890ff;
    border-color: #1890ff;
  }
}

.option-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.option-desc {
  display: block;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}
</style>
