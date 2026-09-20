/**
 * 物流成本估算引擎（纯函数，无框架依赖，可独立复用 / 单测）
 *
 * 服务分三类：仓储 warehousing、干线运输 transport、末端配送 delivery。
 * 用户可在每类中多选，选中项做笛卡尔积，为每一组货量/距离/时效条件生成多套方案。
 */

export const SERVICE_GROUPS = [
  {
    key: 'warehousing',
    label: '仓储服务',
    required: true,
    options: [
      {
        id: 'standard',
        name: '标准仓储',
        desc: '常温平仓，装卸+周转一口价',
        ratePerTon: 48, // 元/吨（含出入库及约定周期周转）
        leadHours: 2
      },
      {
        id: 'cold',
        name: '恒温仓储',
        desc: '15~25℃ 恒温，冷链装卸',
        ratePerTon: 95,
        leadHours: 4
      },
      {
        id: 'bonded',
        name: '保税仓储',
        desc: '海关监管仓，报关与理货',
        ratePerTon: 130,
        leadHours: 12
      }
    ]
  },
  {
    key: 'transport',
    label: '干线运输',
    required: true,
    options: [
      {
        id: 'road',
        name: '公路快运',
        desc: '0.62 元/吨·公里，最低 180 元/票',
        ratePerTonKm: 0.62,
        minCharge: 180,
        speedKmh: 60,
        leadHours: 8 // 集货/装卸等待
      },
      {
        id: 'rail',
        name: '铁路班列',
        desc: '0.45 元/吨·公里，最低 260 元/票',
        ratePerTonKm: 0.45,
        minCharge: 260,
        speedKmh: 45,
        leadHours: 20 // 编组与场站作业
      },
      {
        id: 'air',
        name: '航空货运',
        desc: '2.80 元/吨·公里，最低 800 元/票',
        ratePerTonKm: 2.8,
        minCharge: 800,
        speedKmh: 700,
        leadHours: 6
      }
    ]
  },
  {
    key: 'delivery',
    label: '末端配送',
    required: true,
    options: [
      {
        id: 'standard',
        name: '标准配送',
        desc: '60 元/票 + 8 元/吨',
        baseFee: 60,
        perTon: 8,
        leadHours: 4
      },
      {
        id: 'scheduled',
        name: '预约配送',
        desc: '120 元/票 + 12 元/吨，预约时段送达',
        baseFee: 120,
        perTon: 12,
        leadHours: 8
      },
      {
        id: 'express',
        name: '急速同城',
        desc: '260 元/票 + 25 元/吨，专车直送',
        baseFee: 260,
        perTon: 25,
        leadHours: 2
      }
    ]
  }
]

/** 条件输入范围（超出范围即失败项） */
export const LIMITS = {
  weight: { label: '货量', unit: '吨', min: 0.01, max: 50, decimals: 2 },
  distance: { label: '距离', unit: '公里', min: 1, max: 5000, decimals: 0 },
  sla: { label: '时效', unit: '小时', min: 1, max: 240, decimals: 0 }
}

export const MAX_ROWS = 20

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

/** 解析单个输入：空 / 非数字 / 数值 */
function parseField(raw) {
  if (raw === null || raw === undefined) return { empty: true }
  const s = String(raw).trim()
  if (s === '') return { empty: true }
  const n = Number(s)
  if (!Number.isFinite(n)) return { invalid: true }
  return { value: n }
}

/** 校验一行条件，返回错误信息数组与解析后数据 */
export function validateRow(raw) {
  const errors = []
  const data = {}

  ;['weight', 'distance', 'sla'].forEach((field) => {
    const limit = LIMITS[field]
    const r = parseField(raw[field])
    if (r.empty) {
      errors.push(`${limit.label}为空`)
    } else if (r.invalid) {
      errors.push(`${limit.label}「${String(raw[field]).trim()}」不是有效数字`)
    } else {
      data[field] = r.value
      if (r.value <= 0) {
        errors.push(`${limit.label}必须大于 0`)
      } else if (r.value < limit.min || r.value > limit.max) {
        errors.push(
          `${limit.label} ${r.value} ${limit.unit}超出允许范围 ${limit.min}~${limit.max} ${limit.unit}`
        )
      }
    }
  })

  return { ok: errors.length === 0, errors, data }
}

/** 选中的服务 id -> 服务定义 */
function resolveServices(selected) {
  const map = {}
  SERVICE_GROUPS.forEach((group) => {
    map[group.key] = group.options.filter((opt) =>
      (selected[group.key] || []).includes(opt.id)
    )
  })
  return map
}

/** 笛卡尔积：选中的各类服务组合成方案 */
function buildCombos(resolved) {
  const combos = []
  resolved.warehousing.forEach((w) => {
    resolved.transport.forEach((t) => {
      resolved.delivery.forEach((d) => {
        combos.push({ warehousing: w, transport: t, delivery: d })
      })
    })
  })
  return combos
}

/** 单个方案费用测算 */
export function quotePlan(combo, data) {
  const { warehousing, transport, delivery } = combo

  const warehousingFee = round2(data.weight * warehousing.ratePerTon)
  const transportFee = round2(
    Math.max(
      transport.minCharge,
      data.weight * data.distance * transport.ratePerTonKm
    )
  )
  const deliveryFee = round2(delivery.baseFee + data.weight * delivery.perTon)

  const requiredHours =
    warehousing.leadHours +
    data.distance / transport.speedKmh +
    transport.leadHours +
    delivery.leadHours

  const total = round2(warehousingFee + transportFee + deliveryFee)

  return {
    key: `${warehousing.id}|${transport.id}|${delivery.id}`,
    warehousingId: warehousing.id,
    transportId: transport.id,
    deliveryId: delivery.id,
    warehousingName: warehousing.name,
    transportName: transport.name,
    deliveryName: delivery.name,
    fees: {
      warehousing: warehousingFee,
      transport: transportFee,
      delivery: deliveryFee
    },
    total,
    requiredHours: Math.round(requiredHours * 10) / 10,
    feasible: data.sla >= requiredHours
  }
}

/**
 * 批量估算入口
 * @param {{warehousing:string[], transport:string[], delivery:string[]}} selected
 * @param {Array<{weight:*, distance:*, sla:*}>} rows
 * @returns 批次结果（含逐条成功/失败项、方案费用、预算区间、差异、整组汇总）
 */
export function estimateBatch(selected, rows) {
  const resolved = resolveServices(selected)
  const missingGroups = SERVICE_GROUPS.filter(
    (g) => resolved[g.key].length === 0
  ).map((g) => g.label)
  if (missingGroups.length) {
    return { ok: false, missingGroups }
  }

  const combos = buildCombos(resolved)
  const seenKeys = new Map() // 已出现的条件指纹 -> 行号
  const items = rows.map((raw, idx) => {
    const rowNo = Number.isFinite(raw.__rowNo) ? raw.__rowNo : idx + 1
    const rowId = raw.rowId ?? raw.id ?? rowNo
    const { ok, errors, data } = validateRow(raw)

    if (!ok) {
      return {
        rowId,
        rowNo,
        raw,
        status: 'failed',
        errors,
        plans: []
      }
    }

    const fingerprint = `${data.weight}|${data.distance}|${data.sla}`
    if (seenKeys.has(fingerprint)) {
      return {
        rowId,
        rowNo,
        raw,
        status: 'failed',
        errors: [`与第 ${seenKeys.get(fingerprint)} 行条件完全相同，属于重复输入`],
        data,
        plans: []
      }
    }
    seenKeys.set(fingerprint, rowNo)

    const plans = combos.map((combo) => quotePlan(combo, data))
    const feasiblePlans = plans.filter((p) => p.feasible)
    const pricingPlans = feasiblePlans.length ? feasiblePlans : plans

    const cheapest = pricingPlans.reduce(
      (min, p) => (p.total < min.total ? p : min),
      pricingPlans[0]
    )
    const costliest = pricingPlans.reduce(
      (max, p) => (p.total > max.total ? p : max),
      pricingPlans[0]
    )

    plans.forEach((p) => {
      p.delta = round2(p.total - cheapest.total)
      p.deltaPct = cheapest.total
        ? Math.round((p.delta / cheapest.total) * 1000) / 10
        : 0
      p.isCheapestFeasible = feasiblePlans.length > 0 && p.key === cheapest.key
    })

    return {
      rowId,
      rowNo,
      raw,
      status: 'success',
      errors: [],
      data,
      plans,
      feasibleCount: feasiblePlans.length,
      budget: {
        low: round2(cheapest.total * 0.95),
        high: round2(costliest.total * 1.08),
        degraded: feasiblePlans.length === 0 // 无方案满足时效时按理论费用给区间
      },
      cheapestKey: cheapest.key
    }
  })

  const successItems = items.filter((i) => i.status === 'success')
  const aggregate = {
    low: round2(successItems.reduce((s, i) => s + i.budget.low, 0)),
    high: round2(successItems.reduce((s, i) => s + i.budget.high, 0))
  }

  return {
    ok: true,
    id: `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    selected: {
      warehousing: [...selected.warehousing],
      transport: [...selected.transport],
      delivery: [...selected.delivery]
    },
    comboCount: combos.length,
    items,
    summary: {
      totalRows: items.length,
      successCount: successItems.length,
      failedCount: items.length - successItems.length
    },
    aggregate
  }
}

export function findService(groupKey, id) {
  const group = SERVICE_GROUPS.find((g) => g.key === groupKey)
  return group ? group.options.find((o) => o.id === id) : null
}

const fingerprintOf = (d) => `${d.weight}|${d.distance}|${d.sla}`

/**
 * 重试合并：仅把失败行重新测算，保留批次中原本成功的有效结果。
 * @param {object} batch 原批次
 * @param {object} retryResult 对失败行调用 estimateBatch 得到的新批次
 * @returns 新批次（新 id / 时间戳；原批次不被修改）
 */
export function mergeRetryResult(batch, retryResult) {
  // 原批次成功项的条件指纹（重试行若与之相同，视为与已通过行重复）
  const existing = new Map()
  batch.items
    .filter((i) => i.status === 'success')
    .forEach((i) => existing.set(fingerprintOf(i.data), i.rowNo))

  const retriedByRowId = new Map(
    retryResult.items.map((item) => [item.rowId, item])
  )
  const retriedByRowNo = new Map(
    retryResult.items.map((item) => [item.rowNo, item])
  )

  const items = batch.items.map((oldItem) => {
    if (oldItem.status === 'success') return oldItem
    const fresh =
      retriedByRowId.get(oldItem.rowId) ?? retriedByRowNo.get(oldItem.rowNo)
    if (!fresh) return oldItem

    if (fresh.status === 'success' && existing.has(fingerprintOf(fresh.data))) {
      return {
        ...fresh,
        status: 'failed',
        errors: [
          `与已通过的第 ${existing.get(fingerprintOf(fresh.data))} 行条件完全相同，属于重复输入`
        ],
        plans: []
      }
    }

    if (fresh.status === 'success') {
      existing.set(fingerprintOf(fresh.data), fresh.rowNo)
    }
    return fresh
  })

  const successItems = items.filter((i) => i.status === 'success')
  return {
    ...batch,
    id: `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    retriedFrom: batch.id,
    items,
    summary: {
      totalRows: items.length,
      successCount: successItems.length,
      failedCount: items.length - successItems.length
    },
    aggregate: {
      low: round2(successItems.reduce((s, i) => s + i.budget.low, 0)),
      high: round2(successItems.reduce((s, i) => s + i.budget.high, 0))
    }
  }
}

/** 人民币金额格式化：1234.5 -> 1,234.50 */
export function formatMoney(n) {
  return `¥${Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

/** 批次时间戳格式化 */
export function formatTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
