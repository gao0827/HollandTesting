const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const { buildDeepReport } = require('../services/report-service')
const { buildProfessionalProfile } = require('../services/professional-scoring')
const { normalizeProfessionalSummary } = require('../services/professional-summary')

const QUOTE_LIFETIME = 10 * 60 * 1000

function makeStore(filename) {
  const database = new DatabaseSync(filename)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS report_orders (
      id TEXT PRIMARY KEY,
      openid TEXT NOT NULL,
      record_id TEXT NOT NULL,
      price_fen INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      env INTEGER NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0,
      closed INTEGER NOT NULL DEFAULT 0,
      report_digest TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS report_active_order ON report_orders (openid, record_id) WHERE closed = 0;
  `)
  // 兼容旧订单库。加列和检测在同一写事务内执行。
  database.exec('BEGIN IMMEDIATE')
  try {
    if (!database.prepare('PRAGMA table_info(report_orders)').all().some(({ name }) => name === 'report_digest')) {
      database.exec("ALTER TABLE report_orders ADD COLUMN report_digest TEXT NOT NULL DEFAULT ''")
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    database.close()
    throw error
  }
  const columns = 'id, openid, record_id AS recordId, price_fen AS priceFen, product_id AS productId, env, delivered, closed'
  const active = database.prepare(`SELECT ${columns} FROM report_orders WHERE openid = ? AND record_id = ? AND closed = 0`)
  const latest = database.prepare('SELECT id FROM report_orders WHERE openid = ? AND record_id = ? ORDER BY rowid DESC LIMIT 1')
  const byId = database.prepare(`SELECT ${columns} FROM report_orders WHERE id = ?`)
  const insert = database.prepare(`
    INSERT INTO report_orders (id, openid, record_id, price_fen, product_id, env)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE COALESCE((SELECT id FROM report_orders WHERE openid = ? AND record_id = ? ORDER BY rowid DESC LIMIT 1), '') = ?
    ON CONFLICT DO NOTHING
  `)
  const delivered = database.prepare('UPDATE report_orders SET delivered = 1 WHERE id = ? AND closed = 0')
  const closed = database.prepare('UPDATE report_orders SET closed = 1 WHERE id = ?')
  const unused = database.prepare('UPDATE report_orders SET closed = 1 WHERE id = ? AND delivered = 0 AND closed = 0')
  const bindReport = database.prepare(`
    UPDATE report_orders SET report_digest = ?
    WHERE id = ? AND delivered = 1 AND closed = 0 AND (report_digest = '' OR report_digest = ?)
  `)
  return {
    active: (openid, recordId) => active.get(openid, recordId),
    latestId: (openid, recordId) => latest.get(openid, recordId)?.id || '',
    byId: (id) => byId.get(id),
    reserve(openid, recordId, config, previousId) {
      const id = randomBytes(16).toString('hex')
      const inserted = insert.run(id, openid, recordId, config.priceFen, config.productId, config.env, openid, recordId, previousId)
      return inserted.changes === 1 ? byId.get(id) : null
    },
    markDelivered: (id) => delivered.run(id),
    markClosed: (id) => closed.run(id),
    markUnused: (id) => unused.run(id),
    bindReport: (id, digest) => bindReport.run(digest, id, digest).changes === 1,
    close: () => database.close()
  }
}

function getReportData(summary) {
  const record = normalizeProfessionalSummary(summary)
  if (!record) return null
  const fingerprint = JSON.stringify([
    record.user_type ?? null,
    record.questionnaire_version,
    summary.scoringVersion,
    record.dimensions.map(({ rawScore }) => rawScore),
    Object.entries(record.professional_scores).map(([section, groups]) =>
      [section, groups.map(({ id, answered, percentage }) => [id, answered, percentage])]
    )
  ])
  return {
    digest: createHash('sha256').update(fingerprint).digest('hex'),
    report: buildDeepReport(record),
    professionalProfile: buildProfessionalProfile(record)
  }
}

function createCheckout(config, provider, store, now = Date.now) {
  const deliveries = new Map()

  function signQuote(openid, recordId, previousId, expires) {
    const quote = JSON.stringify(['holland-report-quote', openid, recordId, previousId, config.priceFen, config.productId, config.env, expires])
    return createHmac('sha256', config.appKey).update(quote).digest('hex')
  }

  function quote(openid, recordId) {
    const expires = now() + QUOTE_LIFETIME
    const previousId = store.latestId(openid, recordId)
    return { status: 'locked', priceFen: config.priceFen, quoteId: `${expires}.${signQuote(openid, recordId, previousId, expires)}` }
  }

  function validQuote(openid, recordId, previousId, input) {
    if (input.priceFen !== config.priceFen || typeof input.quoteId !== 'string') return false
    const match = /^(\d{1,16})\.([a-f0-9]{64})$/.exec(input.quoteId)
    if (!match || Number(match[1]) <= now()) return false
    return timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(signQuote(openid, recordId, previousId, Number(match[1])), 'hex'))
  }

  async function statusFor(order, fromPush = false) {
    if (!order) return 'locked'
    const remote = await provider.queryOrder(order)
    if (remote.status === 0) {
      store.markUnused(order.id)
      return store.byId(order.id)?.closed ? 'locked' : 'pending'
    }
    if (![0, 7].includes(remote.order_type) || remote.order_fee !== order.priceFen) {
      throw new Error('微信订单类型或金额与购买记录不一致')
    }
    if ([5, 6, 8].includes(remote.status)) {
      store.markClosed(order.id)
      return 'locked'
    }
    if (![2, 3, 4].includes(remote.status)) return 'pending'
    if (remote.status === 2 && !fromPush && !store.byId(order.id)?.delivered) {
      if (!deliveries.has(order.id)) {
        const confirmation = Promise.resolve().then(() => provider.confirmDelivery(order))
          .then(() => store.markDelivered(order.id)).finally(() => deliveries.delete(order.id))
        deliveries.set(order.id, confirmation)
      }
      await deliveries.get(order.id)
    }
    store.markDelivered(order.id)
    const updated = store.byId(order.id)
    return updated?.delivered && !updated.closed ? 'unlocked' : 'pending'
  }

  async function verifiedStatus(order) {
    try {
      return await statusFor(order)
    } catch {
      return 'pending'
    }
  }

  return {
    async handle(operation, input) {
      const { recordId, code } = input || {}
      if (typeof recordId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(recordId) ||
          typeof code !== 'string' || !code.trim() || code.length > 256) {
        return { httpStatus: 400, error: '请求参数无效' }
      }
      let session
      try {
        session = await provider.login(code)
      } catch {
        return { httpStatus: 401, error: '微信会话验证失败' }
      }
      const stored = store.active(session.openid, recordId)
      const status = await verifiedStatus(stored)
      const state = status === 'locked' || !stored ? { recordId, status } : { recordId, status, orderId: stored.id }
      if (operation === 'status') return status === 'locked' ? { recordId, ...quote(session.openid, recordId) } : state
      if (operation === 'report') {
        if (status !== 'unlocked') return state
        const reportData = getReportData(input.summary)
        if (!reportData) return { httpStatus: 422, error: '测评版本或汇总分数无效' }
        const { digest, ...content } = reportData
        if (!store.bindReport(stored.id, digest)) {
          return store.byId(stored.id)?.closed
            ? { recordId, status: 'locked' }
            : { httpStatus: 409, error: '本次分数与已生成的报告不一致' }
        }
        return { ...state, ...content }
      }
      if (operation !== 'order') return { httpStatus: 404, error: '接口不存在' }
      if (status !== 'locked') return state
      const previousId = store.latestId(session.openid, recordId)
      if (!validQuote(session.openid, recordId, previousId, input)) return state
      const order = store.reserve(session.openid, recordId, config, previousId)
      if (!order) return { recordId, status: 'pending' }
      return { recordId, status: 'payable', orderId: order.id, priceFen: order.priceFen, payment: provider.signOrder(order, session.sessionKey) }
    },
    async receiveDelivery(event) {
      if (event.Event !== 'xpay_goods_deliver_notify') return
      const order = typeof event.OutTradeNo === 'string' ? store.byId(event.OutTradeNo) : null
      if (!order || event.OpenId !== order.openid ||
          event.GoodsInfo?.ProductId !== order.productId || event.GoodsInfo?.Quantity !== 1) {
        throw new Error('微信发货通知与购买记录不一致')
      }
      if (order.closed) return
      if (await statusFor(order, true) !== 'unlocked') throw new Error('微信发货状态待确认')
    }
  }
}

module.exports = { makeStore, createCheckout }
