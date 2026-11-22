const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { DatabaseSync } = require('node:sqlite')
const { createHash, createHmac, createCipheriv } = require('node:crypto')
const { makeStore, createCheckout } = require('../server/report-checkout')
const { createWechatPay, createWechatPush } = require('../server/wechat-pay')
const { readConfig, createHttpServer } = require('../server')
const { createReportCommerce } = require('../services/commercial-service')
const { checkPaymentEndpoint } = require('../scripts/check-release')
const { questions, questionnaire } = require('../data/questionnaire-professional')
const { calculateProfessionalResult } = require('../services/professional-scoring')

const config = {
  priceFen: 900, productId: 'test-product', offerId: 'test-offer', env: 0, appKey: 'test-key',
  appId: 'wx0000000000000000', appSecret: 'test-secret', pushToken: 'test-push',
  encodingAesKey: Buffer.alloc(32, 12).toString('base64').slice(0, -1)
}

function validSummary() {
  const result = calculateProfessionalResult(Object.fromEntries(questions.map(({ id }) => [id, 4])))
  return {
    userType: 'career_transition',
    questionnaireVersion: questionnaire.questionnaire_version,
    scoringVersion: questionnaire.scoring_version,
    interestScores: result.rawScores,
    professionalScores: result.professionalScores
  }
}

test('服务端按账号和记录锁定价格，重启后查单并生成报告，退款后撤销权益', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'holland-checkout-'))
  const database = path.join(directory, 'orders.db')
  let store = makeStore(database)
  t.after(() => {
    store.close()
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file))
    fs.rmdirSync(directory)
  })
  const remote = new Map()
  const deliveries = []
  const provider = {
    async login(code) { return { openid: code, sessionKey: 'test-session' } },
    signOrder: createWechatPay(config).signOrder,
    async queryOrder(order) { return { status: remote.get(order.id) ?? 0, order_type: 0, order_fee: order.priceFen } },
    async confirmDelivery(order) { deliveries.push(order.id) }
  }
  let time = 1700000000000
  let checkout = createCheckout(config, provider, store, () => time)
  const input = { code: 'alice', recordId: '1700000000000' }
  const draft = await checkout.handle('status', input)
  assert.equal(draft.status, 'locked')
  assert.equal(draft.priceFen, 900)
  assert.deepEqual(await checkout.handle('order', { ...draft, ...input, code: 'bob' }), { recordId: input.recordId, status: 'locked' })
  assert.deepEqual(await checkout.handle('order', { ...draft, ...input, priceFen: 1 }), { recordId: input.recordId, status: 'locked' })
  time += 10 * 60 * 1000
  assert.equal((await checkout.handle('order', { ...draft, ...input })).status, 'locked')
  const freshQuote = await checkout.handle('status', input)
  const first = await checkout.handle('order', { ...freshQuote, ...input })
  assert.equal(first.status, 'payable')
  assert.equal((await checkout.handle('order', { ...freshQuote, ...input })).status, 'locked')
  assert.equal(store.byId(first.orderId).closed, 1)
  const replacementQuote = await checkout.handle('status', input)
  const attempts = await Promise.all([
    checkout.handle('order', { ...replacementQuote, ...input }),
    checkout.handle('order', { ...replacementQuote, ...input })
  ])
  const [purchase] = attempts.filter((order) => order.status === 'payable')
  assert.equal(attempts.filter((order) => order.status === 'payable').length, 1)
  const { outTradeNo } = JSON.parse(purchase.payment.signData)
  assert.notEqual(outTradeNo, first.orderId)

  store.close()
  const oldSchema = new DatabaseSync(database)
  oldSchema.exec('ALTER TABLE report_orders DROP COLUMN report_digest')
  oldSchema.close()
  store = makeStore(database)
  checkout = createCheckout(config, provider, store, () => time)
  remote.set(outTradeNo, 1)
  const summary = validSummary()
  assert.equal((await checkout.handle('report', { ...input, summary })).status, 'pending')
  assert.equal((await checkout.handle('report', { ...input, code: 'bob', summary })).status, 'locked')
  remote.set(outTradeNo, 2)
  const [result, status] = await Promise.all([
    checkout.handle('report', { ...input, summary }),
    checkout.handle('status', input)
  ])
  assert.equal(result.status, 'unlocked')
  assert.equal(status.status, 'unlocked')
  assert.equal(status.orderId, outTradeNo)
  assert.deepEqual(deliveries, [outTradeNo])
  assert.equal(result.report.profile.dimensions[0].percentage, 75)
  assert.equal(result.report.plan.label, '职场转型路线')
  assert.equal(result.professionalProfile.length, 4)
  assert.deepEqual(await checkout.handle('report', { ...input, summary }), result)
  const changed = { ...summary, interestScores: { ...summary.interestScores, R: summary.interestScores.R + 1 } }
  assert.equal((await checkout.handle('report', { ...input, summary: changed })).httpStatus, 409)
  assert.equal((await checkout.handle('report', { ...input, summary: { ...summary, interestScores: { R: 99 } } })).httpStatus, 422)

  remote.set(outTradeNo, 8)
  assert.equal((await checkout.handle('report', { ...input, summary })).status, 'locked')
  assert.equal(store.byId(outTradeNo).closed, 1)
})

test('小程序通过 HTTP 报价、取消、重购、查单和交付，正式发布核验 AppID 与支付环境', async (t) => {
  const store = makeStore(':memory:')
  t.after(() => store.close())
  const transactions = new Map()
  const launched = []
  let cancel = true
  const provider = {
    async login(code) { return { openid: code, sessionKey: 'test-session' } },
    signOrder: createWechatPay(config).signOrder,
    async queryOrder(order) {
      return { status: transactions.get(order.id) ?? 0, order_type: 0, order_fee: order.priceFen }
    },
    async confirmDelivery() {}
  }
  const server = createHttpServer(createCheckout(config, provider, store), {}, config)
  const endpoint = 'https://example.test/professional-report'
  function dispatch(url, method, data) {
    return new Promise((resolve) => {
      const input = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : [])
      input.url = new URL(url).pathname
      input.method = method
      let statusCode
      server.emit('request', input, {
        writeHead(code) { statusCode = code },
        end(body) { resolve({ statusCode, data: JSON.parse(body) }) }
      })
    })
  }
  const platform = {
    login({ success }) { success({ code: 'account-test' }) },
    request({ url, method, data, success, fail }) { dispatch(url, method, data).then(success, fail) },
    requestVirtualPayment({ signData, success, fail }) {
      const order = JSON.parse(signData)
      launched.push(order.outTradeNo)
      if (cancel) fail({ errCode: -2 })
      else {
        transactions.set(order.outTradeNo, 2)
        success({})
      }
    }
  }
  const commerce = createReportCommerce(
    { payments: true, paidReportUnlock: true },
    { professionalReportApi: endpoint },
    () => platform
  )
  const readHealth = async (url) => {
    const response = await dispatch(url, 'GET')
    return { ok: response.statusCode === 200, json: async () => response.data }
  }
  assert.deepEqual(await checkPaymentEndpoint(endpoint, config, readHealth), [])
  assert.match((await checkPaymentEndpoint(endpoint, { ...config, appId: 'other-app' }, readHealth))[0], /不同的 AppID/)
  assert.match((await checkPaymentEndpoint(endpoint, { ...config, priceFen: 1200 }, readHealth))[0], /售价/)
  assert.match((await checkPaymentEndpoint(endpoint, config, async () =>
    ({ ok: true, json: async () => ({ service: 'holland-report-payment', appId: config.appId, paymentEnv: 1 }) })))[0], /正式环境/)
  const id = 'checkout-demo-record'
  const initial = await commerce.verifyOrder(id)
  const afterCancel = await commerce.startPayment(id, initial)
  assert.equal(afterCancel.paymentInterrupted, true)
  assert.equal(afterCancel.status, 'locked')
  await assert.rejects(commerce.startPayment(id, initial), /重新查询报价/)
  cancel = false
  const afterPayment = await commerce.startPayment(id, afterCancel)
  assert.equal(afterPayment.status, 'unlocked')
  assert.equal(afterPayment.orderId, launched[1])
  assert.equal(new Set(launched).size, 2)
  const restored = await commerce.verifyOrder(id)
  assert.equal(restored.orderId, afterPayment.orderId)
  assert.equal((await commerce.unlockReport(id, validSummary())).professionalProfile.length, 4)
  transactions.set(afterPayment.orderId, 8)
  await assert.rejects(commerce.unlockReport(id, validSummary()), { code: 'REPORT_ENTITLEMENT_CHANGED' })
})

test('微信适配器签名覆盖原始请求，消息推送校验密文签名和 AppID', async () => {
  assert.throws(() => readConfig({}), /配置不完整/)
  assert.equal(readConfig({
    HOLLAND_WECHAT_APP_ID: config.appId,
    HOLLAND_WECHAT_APP_SECRET: config.appSecret,
    HOLLAND_WECHAT_OFFER_ID: config.offerId,
    HOLLAND_WECHAT_PAY_KEY: config.appKey,
    HOLLAND_WECHAT_PRODUCT_ID: config.productId,
    HOLLAND_WECHAT_PUSH_TOKEN: config.pushToken,
    HOLLAND_WECHAT_PUSH_AES_KEY: config.encodingAesKey,
    HOLLAND_REPORT_DB_PATH: ':memory:'
  }).priceFen, 590)
  const requests = []
  const provider = createWechatPay(config, async (url, options) => {
    requests.push({ url, options })
    const responses = {
      '/sns/jscode2session': { openid: 'openid-test', session_key: 'session-test' },
      '/cgi-bin/stable_token': { access_token: 'test-token', expires_in: 7200 },
      '/xpay/query_order': { errcode: 0, order: { order_id: 'trade-id', status: 2, order_fee: 900, order_type: 0 } },
      '/xpay/notify_provide_goods': { errcode: 0 }
    }
    return { ok: true, json: async () => responses[url.pathname] }
  })
  const order = { id: 'trade-id', openid: 'openid-test', env: 0, productId: config.productId, priceFen: 900 }
  const session = await provider.login('local-test-code')
  assert.equal((await provider.queryOrder(order)).status, 2)
  await provider.confirmDelivery(order)
  assert.equal(requests.length, 4)
  for (const { url, options } of requests.slice(2)) {
    const signature = createHmac('sha256', config.appKey).update(`${url.pathname}&${options.body}`).digest('hex')
    assert.equal(url.searchParams.get('pay_sig'), signature)
  }
  const payment = provider.signOrder(order, session.sessionKey)
  assert.equal(payment.signature, createHmac('sha256', session.sessionKey).update(payment.signData).digest('hex'))

  const push = createWechatPush(config)
  const event = { Event: 'xpay_goods_deliver_notify', OutTradeNo: order.id }
  const serialize = (appid) => {
    const message = Buffer.from(JSON.stringify(event))
    const prefix = Buffer.alloc(20)
    prefix.writeUInt32BE(message.length, 16)
    const content = Buffer.concat([prefix, message, Buffer.from(appid)])
    const padding = 32 - content.length % 32
    const key = Buffer.from(`${config.encodingAesKey}=`, 'base64')
    const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16)).setAutoPadding(false)
    return Buffer.concat([cipher.update(Buffer.concat([content, Buffer.alloc(padding, padding)])), cipher.final()]).toString('base64')
  }
  const params = (encrypted) => new URLSearchParams({
    timestamp: '1700000000', nonce: 'test-nonce',
    msg_signature: createHash('sha1').update([config.pushToken, '1700000000', 'test-nonce', encrypted].sort().join('')).digest('hex')
  })
  const encrypted = serialize(config.appId)
  assert.deepEqual(push.readEvent(params(encrypted), { Encrypt: encrypted }), event)
  assert.throws(() => push.readEvent(new URLSearchParams(), { Encrypt: encrypted }), /验签|签名/)
  const wrongApp = serialize('wx1111111111111111')
  assert.throws(() => push.readEvent(params(wrongApp), { Encrypt: wrongApp }), /AppID/)
})
