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
