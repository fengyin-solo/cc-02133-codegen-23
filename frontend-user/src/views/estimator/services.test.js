import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateBatch,
  estimatePlan,
  validateRow,
  round2,
  LIMITS
} from './services.js'

const SEL_ALL = {
  warehouse: ['std', 'cold'],
  transport: ['road_ltl', 'air'],
  delivery: ['standard', 'same_day']
}

// ---------------------------------------------------------------------------
// 校验：空值 / 非数字 / 超范围 / 重复
// ---------------------------------------------------------------------------

test('空字段逐项标明失败原因', () => {
  const r = validateRow({ weight: '', volume: '', distance: '', sla: '' }, 0, new Map())
  assert.equal(r.ok, false)
  assert.deepEqual(r.errors, [
    '货量不能为空',
    '体积不能为空',
    '距离不能为空',
    '时效要求不能为空'
  ])
})

test('非数字与零值判为失败', () => {
  const r = validateRow(
    { weight: 'abc', volume: '0', distance: '-10', sla: 'standard' },
    0,
    new Map()
  )
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('必须为数字')))
  assert.ok(r.errors.some((e) => e.includes('货量必须大于 0') || e.includes('必须大于 0')))
})

test('超出范围判为失败', () => {
  const r = validateRow(
    { weight: String(LIMITS.weight.max + 1), volume: '5', distance: '100', sla: 'standard' },
    0,
    new Map()
  )
  assert.equal(r.ok, false)
  assert.ok(r.errors[0].includes('超出可测算范围'))
})

test('密度异常判为失败', () => {
  const r = validateRow(
    { weight: '10000', volume: '1', distance: '100', sla: 'standard' },
    0,
    new Map()
  )
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('密度异常')))
})

test('完全重复的条件标明与第几行重复', () => {
  const seen = new Map()
  const first = validateRow(
    { weight: '1000', volume: '2', distance: '300', sla: 'standard' },
    0,
    seen
  )
  assert.equal(first.ok, true)
  const dup = validateRow(
    { weight: '1000', volume: '2', distance: '300', sla: 'standard' },
    1,
    seen
  )
  assert.equal(dup.ok, false)
  assert.ok(dup.errors[0].includes('与第 1 行条件完全重复'))
})

// ---------------------------------------------------------------------------
// 费用测算
// ---------------------------------------------------------------------------

test('仓储费按体积周计费且不低于最低收费', () => {
  // 标准仓 12 元/m³/周，minFee 100
  const small = estimatePlan('std', 'road_ltl', 'standard', { weight: 100, volume: 1, distance: 100 }, 'standard')
  assert.equal(small.fees.warehouse, 100)

  const big = estimatePlan('std', 'road_ltl', 'standard', { weight: 100, volume: 10, distance: 100 }, 'standard')
  assert.equal(big.fees.warehouse, 120)
})

test('公路零担按重量×距离×费率计费且不低于最低收费', () => {
  const p = estimatePlan('std', 'road_ltl', 'standard', { weight: 1000, volume: 5, distance: 500 }, 'standard')
  // 0.0009 * 1000 * 500 = 450
  assert.equal(p.fees.transport, 450)
})

test('航空运输含基础费并校验单票限重', () => {
  const p = estimatePlan('std', 'air', 'standard', { weight: 2000, volume: 5, distance: 800 }, 'next_day')
  // 4.5*2000 + 0.002*2000*800 = 9000 + 3200 = 12200
  assert.equal(p.fees.transport, 12200)
  assert.equal(p.feasible, false)
  assert.ok(p.reasons.some((r) => r.includes('单票重量上限')))
})

test('当日达超过距离上限判为不可行', () => {
  const p = estimatePlan('std', 'road_ltl', 'same_day', { weight: 1000, volume: 5, distance: 600 }, 'standard')
  assert.equal(p.feasible, false)
  assert.ok(p.reasons.some((r) => r.includes('当日达仅支持')))
})

test('时效不满足时标记不可行但仍给出费用与预算区间', () => {
  // 水路 350km/天，5000km => 15 天干运 + 标准配送 2 天 = 17 天，标准 SLA 要求 4 天
  const p = estimatePlan('std', 'water', 'standard', { weight: 1000, volume: 5, distance: 5000 }, 'standard')
  assert.equal(p.totalDays, 17)
  assert.equal(p.feasible, false)
  assert.ok(p.reasons[0].includes('超出'))
  assert.ok(p.budget.low < p.total)
  assert.ok(p.budget.high > p.total)
})

test('预算区间按时效波动生成（标准 ±8%）', () => {
  const p = estimatePlan('std', 'road_ltl', 'standard', { weight: 1000, volume: 5, distance: 500 }, 'standard')
  assert.equal(p.budget.low, round2(p.total * 0.92))
  assert.equal(p.budget.high, round2(p.total * 1.08))
})

test('当日时效波动 ±18%', () => {
  const p = estimatePlan('std', 'air', 'same_day', { weight: 100, volume: 2, distance: 200 }, 'same_day')
  assert.equal(p.budget.tolerance, 0.18)
})

// ---------------------------------------------------------------------------
// 整批
// ---------------------------------------------------------------------------

test('批量结果逐行成功/失败统计并生成方案笛卡尔积', () => {
  const rows = [
    { weight: '1000', volume: '5', distance: '300', sla: 'standard' },
    { weight: '', volume: '5', distance: '300', sla: 'standard' } // 失败
  ]
  const batch = estimateBatch(SEL_ALL, rows)
  assert.equal(batch.stats.total, 2)
  assert.equal(batch.stats.success, 1)
  assert.equal(batch.stats.failed, 1)
  // 2 仓 × 2 运 × 2 配 = 8 方案
  assert.equal(batch.stats.plans, 8)

  const ok = batch.rows[0]
  assert.equal(ok.status, 'success')
  assert.equal(ok.plans.length, 8)
  const recommended = ok.plans.find((p) => p.key === ok.recommendedKey)
  assert.equal(recommended.feasible, true)
  assert.equal(recommended.isCheapest, true)
  assert.ok(ok.cheapestTotal > 0)

  assert.equal(batch.rows[1].status, 'failed')
  assert.ok(batch.rows[1].errors.includes('货量不能为空'))
})

test('全部不可行时不产生推荐方案', () => {
  // 航空超重 + 任意组合都不可行（air 唯一运输选项）
  const batch = estimateBatch(
    { warehouse: ['std'], transport: ['air'], delivery: ['standard'] },
    [{ weight: '5000', volume: '10', distance: '2000', sla: 'same_day' }]
  )
  const row = batch.rows[0]
  assert.equal(row.feasibleCount, 0)
  assert.equal(row.recommendedKey, null)
  assert.equal(row.cheapestTotal, null)
})
