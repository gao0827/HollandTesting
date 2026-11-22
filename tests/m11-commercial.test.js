const test = require('node:test')
const assert = require('node:assert/strict')
const { FEATURE_FLAGS } = require('../config/product')
const commercial = require('../services/commercial-service')

test('广告、支付和付费解锁默认关闭，本地深度报告仍可使用', () => {
  assert.equal(FEATURE_FLAGS.advertising, false)
  assert.equal(FEATURE_FLAGS.payments, false)
  assert.equal(FEATURE_FLAGS.paidReportUnlock, false)
  assert.equal(FEATURE_FLAGS.deepReport, true)
})

test('商业接口拒绝操作，即使调用参数声称支付成功也不会解锁', async (t) => {
  const calls = []
  global.wx = new Proxy({}, { get(_, key) { calls.push(key) } })
  t.after(() => { delete global.wx })
  const operations = ['showAd', 'createOrder', 'startPayment', 'verifyOrder', 'unlockReport', 'requestRefund']
  for (const operation of operations) {
    await assert.rejects(commercial[operation]({ paid: true, orderId: 'client-claim' }), {
      code: 'COMMERCIAL_DISABLED',
      operation
    })
  }
  assert.deepEqual(calls, [])
})

test('只有标准版报告在启用且具备广告位时展示广告', () => {
  const flags = { advertising: true }
  const settings = { standardReportAdUnitId: 'adunit-123456' }
  assert.equal(commercial.getReportAdUnit({ assessment_type: 'standard' }, flags, settings), 'adunit-123456')
  assert.equal(commercial.getReportAdUnit({ assessment_type: 'professional' }, flags, settings), '')
  assert.equal(commercial.getReportAdUnit({ questionnaire_id: 'career-interest-professional' }, flags, settings), '')
  assert.equal(commercial.getReportAdUnit({}, flags, {}), '')
})

test('250 题基础解读只接受激励视频的完整播放回调', async () => {
  const record = { assessment_type: 'professional' }
  const settings = { professionalBasicAdUnitId: 'adunit-67890' }
  assert.equal(commercial.getBasicReportAdUnit(record, { advertising: true }, settings), 'adunit-67890')
  assert.equal(commercial.getBasicReportAdUnit({ assessment_type: 'standard' }, { advertising: true }, settings), '')
  assert.equal(commercial.requiresBasicReportUnlock(record), true)
  assert.equal(commercial.requiresBasicReportUnlock({ ...record, basic_report_ad_completed: true }), false)

  for (const response of [undefined, { isEnded: false }, { isEnded: true }]) {
    let closeListener
    let cleanedUp = false
    const ad = {
      onClose(listener) { closeListener = listener },
      offClose(listener) { cleanedUp = listener === closeListener },
      onError() {},
      async load() {},
      async show() { closeListener(response) }
    }
    const platform = {
      createRewardedVideoAd({ adUnitId }) {
        assert.equal(adUnitId, 'adunit-67890')
        return ad
      }
    }
    assert.equal(await commercial.watchBasicReportAd('adunit-67890', platform), response?.isEnded === true)
    assert.equal(cleanedUp, true)
  }
})

test('虚拟支付回调只触发查单，订单待确认时禁止获取报告', async () => {
  const interactions = []
  const recordId = 'record-123'
  let verifiedStatus = 'pending'
  let paymentCancelled = false
  const priceFen = 900
  const platform = {
    login({ success }) { success({ code: 'test-code' }) },
    request({ url, data, success }) {
      const route = url.split('/').pop()
      interactions.push(route)
      assert.equal(data.recordId, recordId)
      const payloads = {
        order: {
          status: 'payable', priceFen, payment: {
            mode: 'short_series_goods',
            signData: JSON.stringify({ goodsPrice: priceFen, buyQuantity: 1, outTradeNo: 'order123' }),
            paySig: 'signed-payment', signature: 'signed-session'
          }
        },
        status: verifiedStatus === 'locked'
          ? { status: 'locked', priceFen, quoteId: 'refreshed-quote' }
          : { status: verifiedStatus },
        report: verifiedStatus === 'unlocked'
          ? { status: 'unlocked', report: { profile: { dimensions: [] }, plan: { milestones: [] }, careers: [] }, professionalProfile: [] }
          : { status: 'pending' }
      }
      success({ statusCode: 200, data: { recordId, ...payloads[route] } })
    },
    requestVirtualPayment({ success, fail }) {
      interactions.push('payment')
      if (paymentCancelled) fail(new Error('付款取消'))
      else success({})
    }
  }
  const service = commercial.createReportCommerce(
    { payments: true, paidReportUnlock: true },
    { professionalReportApi: 'https://example.test/checkout' },
    () => platform
  )
  await assert.rejects(service.startPayment(recordId, { quoteId: { invalid: true }, priceFen }), /先查询/)
  assert.deepEqual(interactions, [])
  await assert.rejects(service.startPayment(recordId, { quoteId: 'test-quote', priceFen: 800 }), /价格已变化/)
  assert.deepEqual(interactions.splice(0), ['order'])
  const paymentResult = await service.startPayment(recordId, { quoteId: 'test-quote', priceFen })
  assert.equal(paymentResult.status, 'pending')
  assert.deepEqual(interactions, ['order', 'payment', 'status'])
  await assert.rejects(service.unlockReport(recordId, {}), /完整报告暂不可用/)
  interactions.length = 0
  verifiedStatus = 'locked'
  assert.equal((await service.startPayment(recordId, { quoteId: 'test-quote', priceFen })).status, 'pending')
  assert.deepEqual(interactions.splice(0), ['order', 'payment', 'status'])
  paymentCancelled = true
  const interrupted = await service.startPayment(recordId, { quoteId: 'test-quote', priceFen })
  assert.equal(interrupted.status, 'locked')
  assert.equal(interrupted.quoteId, 'refreshed-quote')
  assert.equal(interrupted.paymentInterrupted, true)
  assert.deepEqual(interactions, ['order', 'payment', 'status'])
  verifiedStatus = 'unlocked'
  assert.equal((await service.verifyOrder(recordId)).status, 'unlocked')
  assert.ok((await service.unlockReport(recordId, {})).report)
})
