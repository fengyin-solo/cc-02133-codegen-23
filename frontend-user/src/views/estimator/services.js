/**
 * 物流成本估算引擎（纯函数模块，无 Vue 依赖，可独立测试）
 *
 * 三类服务（均可多选）：
 *  - warehouse 仓储
 *  - transport 运输
 *  - delivery  末端配送
 *
 * 一次提交多组条件（货量 / 距离 / 时效），引擎逐行校验、
 * 对所选服务做笛卡尔组合，逐方案输出费用测算、预算区间与方案差异。
 */

// ---------------------------------------------------------------------------
// 服务目录与计费参数（演示报价，单位：元）
// ---------------------------------------------------------------------------

export const SERVICE_CATALOG = Object.freeze({
  warehouse: [
    {
      id: 'std',
      name: '标准仓储',
      unit: '元/m³/周',
      rate: 12,
      minFee: 100,
      desc: '常温普货存储，适合一般工业品与快消品'
    },
    {
      id: 'cold',
      name: '冷链仓储',
      unit: '元/m³/周',
      rate: 28,
      minFee: 300,
      desc: '-25℃～5℃ 多温区，温湿度全程监控'
    },
    {
      id: 'bonded',
      name: '保税仓储',
      unit: '元/m³/周',
      rate: 22,
      minFee: 200,
      desc: '海关监管仓，支持保税备货与转口贸易'
    }
  ],
  transport: [
    {
      id: 'road_ltl',
      name: '公路零担',
      rate: 0.0009,
      rateUnit: '元/(kg·km)',
      minFee: 120,
      kmPerDay: 700,
      desc: '拼车发运，适合中小批量普货'
    },
    {
      id: 'road_ftl',
      name: '公路整车',
      perKm: 6.5,
      capacity: 30000,
      minFee: 300,
      kmPerDay: 700,
      desc: '整车直达，单车载重上限 30 吨'
    },
    {
      id: 'rail',
      name: '铁路运输',
      rate: 0.00042,
      rateUnit: '元/(kg·km)',
      minFee: 150,
      kmPerDay: 900,
      desc: '中长途干线，运能大、准点稳定'
    },
    {
      id: 'air',
      name: '航空运输',
      basePerKg: 4.5,
      rate: 0.002,
      rateUnit: '元/(kg·km)',
      minFee: 500,
      maxWeight: 1000,
      desc: '高时效长距离，单票重量上限 1 吨'
    },
    {
      id: 'water',
      name: '水路运输',
      rate: 0.00022,
      rateUnit: '元/(kg·km)',
      minFee: 200,
      kmPerDay: 350,
      desc: '大批量低成本，时效相对较慢'
    }
  ],
  delivery: [
    {
      id: 'economy',
      name: '经济配送',
      base: 25,
      perKg: 0.08,
      perCbm: 3,
      minFee: 45,
      days: 3,
      desc: '低成本末端配送，3 天左右送达'
    },
    {
      id: 'standard',
      name: '标准配送',
      base: 35,
      perKg: 0.15,
      perCbm: 6,
      minFee: 60,
      days: 2,
      desc: '常规末端配送，性价比均衡'
    },
    {
      id: 'next_day',
      name: '次日达',
      base: 60,
      perKg: 0.35,
      perCbm: 12,
      minFee: 120,
      days: 1,
      desc: '加急末端网络，次日送达'
    },
    {
      id: 'same_day',
      name: '当日达',
      base: 120,
      perKg: 0.8,
      perCbm: 25,
      minFee: 260,
      days: 0,
      maxDistance: 500,
      desc: '同城/短驳极速配送，限 500km 内'
    }
  ]
})

/**
 * 时效要求（由用户在每组条件中选择）
 * days      —— 要求全程在途天数上限
 * tolerance —— 预算波动幅度（燃油、装卸、季节性等）
 */
export const SLA_OPTIONS = Object.freeze([
  { id: 'economy', label: '经济（7 日内达）', days: 7, tolerance: 0.08 },
  { id: 'standard', label: '标准（4 日内达）', days: 4, tolerance: 0.08 },
  { id: 'next_day', label: '加急（2 日内达）', days: 2, tolerance: 0.12 },
  { id: 'same_day', label: '当日（24 小时内）', days: 1, tolerance: 0.18 }
])

// 输入范围
export const LIMITS = Object.freeze({
  weight: { min: 0, max: 30000, label: '货量' }, // kg
  volume: { min: 0, max: 200, label: '体积' },   // m³
  distance: { min: 0, max: 6000, label: '距离' }, // km
  maxDensity: 1000, // kg/m³，超过视为不合理密度
  maxRows: 50
})

const STORAGE_WEEKS = 1 // 仓储按 1 个计费周（7 天）测算

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `¥${Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

const catalogIndex = (category) =>
  Object.fromEntries(SERVICE_CATALOG[category].map((s) => [s.id, s]))

const WAREHOUSE_MAP = catalogIndex('warehouse')
const TRANSPORT_MAP = catalogIndex('transport')
const DELIVERY_MAP = catalogIndex('delivery')
const SLA_MAP = Object.fromEntries(SLA_OPTIONS.map((s) => [s.id, s]))

function transitDays(transport, distance) {
  if (transport.id === 'air') return distance <= 800 ? 1 : 2
  return Math.max(1, Math.ceil(distance / transport.kmPerDay))
}

// ---------------------------------------------------------------------------
// 逐行校验：空值 / 非数字 / 超范围 / 重复
// raw: { weight, volume, distance, sla } 均允许为空串
// ---------------------------------------------------------------------------

function parsePositive(raw, field, errors) {
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  if (text === '') {
    errors.push(`${LIMITS[field].label}不能为空`)
    return null
  }
  const num = Number(text)
  if (!Number.isFinite(num)) {
    errors.push(`${LIMITS[field].label}必须为数字`)
    return null
  }
  if (num <= LIMITS[field].min) {
    errors.push(`${LIMITS[field].label}必须大于 0`)
    return null
  }
  if (num > LIMITS[field].max) {
    errors.push(
      `${LIMITS[field].label}超出可测算范围（上限 ${LIMITS[field].max.toLocaleString()}）`
    )
    return null
  }
  return num
}

export function validateRow(raw, index, seenKeys) {
  const errors = []

  const weight = parsePositive(raw.weight, 'weight', errors)
  const volume = parsePositive(raw.volume, 'volume', errors)
  const distance = parsePositive(raw.distance, 'distance', errors)

  let sla = null
  const slaText = raw.sla === null || raw.sla === undefined ? '' : String(raw.sla).trim()
  if (slaText === '') {
    errors.push('时效要求不能为空')
  } else if (!SLA_MAP[slaText]) {
    errors.push('时效要求无效')
  } else {
    sla = slaText
  }

  if (weight !== null && volume !== null && weight / volume > LIMITS.maxDensity) {
    errors.push(
      `货物密度异常（${round2(weight / volume)} kg/m³），超出合理范围上限 ${LIMITS.maxDensity} kg/m³`
    )
  }

  if (errors.length === 0) {
    const key = `${round2(weight)}|${round2(volume)}|${round2(distance)}|${sla}`
    if (seenKeys.has(key)) {
      errors.push(`与第 ${seenKeys.get(key) + 1} 行条件完全重复，请修改后再提交`)
    } else {
      seenKeys.set(key, index)
    }
  }

  return {
    ok: errors.length === 0,
    value: errors.length === 0 ? { weight, volume, distance, sla } : null,
    errors
  }
}

// ---------------------------------------------------------------------------
// 单方案费用测算
// ---------------------------------------------------------------------------

function warehouseFee(service, volume) {
  return round2(Math.max(service.minFee, service.rate * volume * STORAGE_WEEKS))
}

function transportFee(service, v) {
  let fee
  if (service.id === 'road_ftl') {
    const trucks = Math.max(1, Math.ceil(v.weight / service.capacity))
    fee = service.perKm * v.distance * trucks
  } else if (service.id === 'air') {
    fee = service.basePerKg * v.weight + service.rate * v.weight * v.distance
  } else {
    fee = service.rate * v.weight * v.distance
  }
  return round2(Math.max(service.minFee, fee))
}

function deliveryFee(service, v) {
  return round2(
    Math.max(
      service.minFee,
      service.base + service.perKg * v.weight + service.perCbm * v.volume
    )
  )
}

export function estimatePlan(warehouseId, transportId, deliveryId, v, slaId) {
  const warehouse = WAREHOUSE_MAP[warehouseId]
  const transport = TRANSPORT_MAP[transportId]
  const delivery = DELIVERY_MAP[deliveryId]
  const sla = SLA_MAP[slaId]

  const fees = {
    warehouse: warehouseFee(warehouse, v.volume),
    transport: transportFee(transport, v),
    delivery: deliveryFee(delivery, v)
  }
  const total = round2(fees.warehouse + fees.transport + fees.delivery)
  const low = round2(total * (1 - sla.tolerance))
  const high = round2(total * (1 + sla.tolerance))

  const linehaulDays = transitDays(transport, v.distance)
  const totalDays = linehaulDays + delivery.days

  const reasons = []
  if (transport.id === 'air' && v.weight > transport.maxWeight) {
    reasons.push(`航空运输单票重量上限 ${transport.maxWeight.toLocaleString()} kg`)
  }
  if (delivery.id === 'same_day' && v.distance > delivery.maxDistance) {
    reasons.push(`当日达仅支持 ${delivery.maxDistance} km 以内的运输距离`)
  }
  if (totalDays > sla.days) {
    reasons.push(`全程预计 ${totalDays} 天，超出「${sla.label}」时效要求`)
  }

  return {
    key: `${warehouseId}|${transportId}|${deliveryId}`,
    warehouseId,
    transportId,
    deliveryId,
    warehouseName: warehouse.name,
    transportName: transport.name,
    deliveryName: delivery.name,
    fees,
    total,
    budget: { low, high, tolerance: sla.tolerance },
    linehaulDays,
    deliveryDays: delivery.days,
    totalDays,
    feasible: reasons.length === 0,
    reasons
  }
}

// ---------------------------------------------------------------------------
// 整批测算
// selection: { warehouse: [id], transport: [id], delivery: [id] }
// rawRows:  [{ weight, volume, distance, sla }]
// ---------------------------------------------------------------------------

export function estimateBatch(selection, rawRows) {
  const seenKeys = new Map()
  const rows = rawRows.map((raw, index) => {
    const result = validateRow(raw, index, seenKeys)
    if (!result.ok) {
      return {
        index,
        raw,
        status: 'failed',
        errors: result.errors
      }
    }

    const v = result.value
    const plans = []
    for (const w of selection.warehouse) {
      for (const t of selection.transport) {
        for (const d of selection.delivery) {
          plans.push(estimatePlan(w, t, d, v, v.sla))
        }
      }
    }

    const feasible = plans.filter((p) => p.feasible)
    const cheapestTotal = feasible.length
      ? Math.min(...feasible.map((p) => p.total))
      : null
    const fastestDays = feasible.length
      ? Math.min(...feasible.map((p) => p.totalDays))
      : null

    for (const p of plans) {
      p.isCheapest = p.feasible && p.total === cheapestTotal
      p.isFastest = p.feasible && p.totalDays === fastestDays
      p.delta = p.feasible && cheapestTotal !== null ? round2(p.total - cheapestTotal) : null
      p.deltaPct =
        p.feasible && cheapestTotal
          ? round2(((p.total - cheapestTotal) / cheapestTotal) * 100)
          : null
      p.daysDelta = p.feasible && fastestDays !== null ? p.totalDays - fastestDays : null
    }

    // 推荐：可行方案中总费用最低，费用相同取时效更快
    const recommended = feasible.length
      ? feasible.reduce((best, p) =>
          p.total < best.total || (p.total === best.total && p.totalDays < best.totalDays)
            ? p
            : best
        )
      : null

    return {
      index,
      raw,
      value: v,
      status: 'success',
      plans,
      feasibleCount: feasible.length,
      cheapestTotal,
      fastestDays,
      recommendedKey: recommended ? recommended.key : null
    }
  })

  return {
    rows,
    stats: {
      total: rows.length,
      success: rows.filter((r) => r.status === 'success').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      plans: rows.reduce(
        (sum, r) => sum + (r.status === 'success' ? r.plans.length : 0),
        0
      ),
      feasiblePlans: rows.reduce(
        (sum, r) => sum + (r.status === 'success' ? r.feasibleCount : 0),
        0
      )
    }
  }
}
