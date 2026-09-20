<template>
  <div class="service-selector">
    <div v-for="category in categories" :key="category.key" class="service-group">
      <div class="group-head">
        <h3 class="group-title">
          <el-icon><component :is="category.icon" /></el-icon>
          {{ category.label }}
          <span class="group-hint">可多选（至少 1 项）</span>
        </h3>
        <span
          class="group-count"
          :class="{ 'is-empty': modelValue[category.key].length === 0 }"
        >
          已选 {{ modelValue[category.key].length }}
        </span>
      </div>
      <div class="service-grid">
        <div
          v-for="svc in catalog[category.key]"
          :key="svc.id"
          class="service-card"
          :class="{ 'is-active': modelValue[category.key].includes(svc.id) }"
          @click="toggle(category.key, svc.id)"
        >
          <div class="card-check">
            <el-icon v-if="modelValue[category.key].includes(svc.id)"><Check /></el-icon>
          </div>
          <div class="card-title">{{ svc.name }}</div>
          <div class="card-price">{{ priceText(svc) }}</div>
          <div class="card-desc">{{ svc.desc }}</div>
        </div>
      </div>
      <div v-if="errors[category.key]" class="group-error">
        <el-icon><WarningFilled /></el-icon>{{ errors[category.key] }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { SERVICE_CATALOG } from './services.js'

defineProps({
  modelValue: {
    type: Object,
    required: true
    // { warehouse: string[], transport: string[], delivery: string[] }
  },
  errors: {
    type: Object,
    default: () => ({})
  }
})
const emit = defineEmits(['update:modelValue'])

const catalog = SERVICE_CATALOG

const categories = [
  { key: 'warehouse', label: '仓储服务', icon: 'House' },
  { key: 'transport', label: '运输服务', icon: 'Van' },
  { key: 'delivery', label: '配送服务', icon: 'Position' }
]

function priceText(svc) {
  if (svc.unit) return `${svc.rate} ${svc.unit}`
  if (svc.perKm) return `${svc.perKm} 元/km（整车）`
  if (svc.basePerKg) return `${svc.basePerKg} 元/kg + 里程费`
  if (svc.rate) return `${svc.rate} ${svc.rateUnit}`
  return `${svc.base} 元/票 + 货量费`
}

function toggle(key, id) {
  const current = modelValue[key]
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id]
  emit('update:modelValue', { ...modelValue, [key]: next })
}
</script>

<style lang="scss" scoped>
.service-group {
  margin-bottom: $spacing-lg;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-sm;
}

.group-title {
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

.group-hint {
  font-size: $font-size-xs;
  font-weight: 400;
  color: $text-secondary;
  margin-left: 4px;
}

.group-count {
  font-size: $font-size-xs;
  color: $primary-color;
  background: rgba($primary-color, 0.1);
  padding: 2px 10px;
  border-radius: 10px;

  &.is-empty {
    color: $danger-color;
    background: rgba($danger-color, 0.1);
  }
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: $spacing-sm;
}

.service-card {
  position: relative;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: $spacing-md;
  cursor: pointer;
  transition: all 0.2s ease;
  background: $bg-white;

  &:hover {
    border-color: $primary-light;
    box-shadow: $shadow-sm;
  }

  &.is-active {
    border-color: $primary-color;
    background: rgba($primary-color, 0.04);
    box-shadow: 0 0 0 1px $primary-color inset;
  }
}

.card-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: $primary-color;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.card-title {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 4px;
  padding-right: 24px;
}

.card-price {
  font-size: $font-size-sm;
  color: $primary-dark;
  font-weight: 600;
  margin-bottom: 6px;
}

.card-desc {
  font-size: $font-size-xs;
  color: $text-secondary;
  line-height: $line-height-base;
}

.group-error {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  color: $danger-color;
}
</style>
