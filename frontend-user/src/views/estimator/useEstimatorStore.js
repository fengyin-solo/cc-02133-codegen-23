/**
 * 估算器会话状态：使用 sessionStorage 持久化
 *  - draft：当前表单（服务多选 + 条件行）
 *  - batches：历次有效批次（无论批次内是否含失败行，整批提交都会留存）
 *
 * 浏览器前进 / 后退、路由切换返回本页时状态不丢失；
 * 重试失败项时仅重算被重试的行，历史有效批次始终保留。
 */
import { ref, reactive, computed, watch } from 'vue'
import { estimateBatch } from './services.js'

const STORAGE_KEY = 'zhiyun:cost-estimator:v1'
const MAX_BATCHES = 10

function makeId() {
  return `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function defaultDraft() {
  return {
    warehouse: ['std'],
    transport: ['road_ltl'],
    delivery: ['standard'],
    rows: [emptyRow()]
  }
}

export function emptyRow() {
  return { weight: '', volume: '', distance: '', sla: 'standard' }
}

function load() {
  try {
    const text = sessionStorage.getItem(STORAGE_KEY)
    if (!text) return { draft: defaultDraft(), batches: [] }
    const data = JSON.parse(text)
    if (!data || !Array.isArray(data.batches) || !data.draft) {
      return { draft: defaultDraft(), batches: [] }
    }
    // 防御性补齐
    data.draft.rows = Array.isArray(data.draft.rows) ? data.draft.rows : [emptyRow()]
    return data
  } catch {
    return { draft: defaultDraft(), batches: [] }
  }
}

const initial = load()

// 单例状态：同一会话内所有组件实例共享
const draft = ref(initial.draft)
const batches = ref(initial.batches)
const currentBatchId = ref(initial.batches.length ? initial.batches[0].id : null)

watch(
  [draft, batches],
  () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: draft.value, batches: batches.value }))
    } catch {
      // 存储不可用时静默降级为内存态
    }
  },
  { deep: true }
)

export function useEstimatorStore() {
  const currentBatch = computed(
    () => batches.value.find((b) => b.id === currentBatchId.value) || null
  )

  /** 提交当前表单：执行整批测算并存档 */
  function submit() {
    const batch = {
      id: makeId(),
      createdAt: Date.now(),
      selection: {
        warehouse: [...draft.value.warehouse],
        transport: [...draft.value.transport],
        delivery: [...draft.value.delivery]
      },
      result: estimateBatch(
        {
          warehouse: [...draft.value.warehouse],
          transport: [...draft.value.transport],
          delivery: [...draft.value.delivery]
        },
        draft.value.rows.map((r) => ({ ...r }))
      )
    }
    batches.value = [batch, ...batches.value].slice(0, MAX_BATCHES)
    currentBatchId.value = batch.id
    return batch
  }

  /** 重试：把失败行原始输入回填到表单（用户修正后重新提交，历史批次保留） */
  function retryBatch(batchId) {
    const batch = batches.value.find((b) => b.id === batchId)
    if (!batch) return
    draft.value.warehouse = [...batch.selection.warehouse]
    draft.value.transport = [...batch.selection.transport]
    draft.value.delivery = [...batch.selection.delivery]
    draft.value.rows = batch.result.rows
      .filter((r) => r.status === 'failed')
      .map((r) => ({ ...r.raw }))
    if (draft.value.rows.length === 0) draft.value.rows = [emptyRow()]
    currentBatchId.value = batchId
  }

  function viewBatch(batchId) {
    currentBatchId.value = batchId
  }

  function clearBatches() {
    batches.value = []
    currentBatchId.value = null
  }

  function resetDraft() {
    draft.value = defaultDraft()
  }

  // reactive 包裹：模板/组件中以 store.draft.rows 方式赋值时会自动解包 ref
  return reactive({
    draft,
    batches,
    currentBatchId,
    currentBatch,
    submit,
    retryBatch,
    viewBatch,
    clearBatches,
    resetDraft
  })
}
