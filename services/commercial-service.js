const { FEATURE_FLAGS, ASSESSMENT_TYPES } = require('../config/product')
const config = require('../config/commercial')

function reserveOperation(operation, feature) {
  return async function unavailable() {
    const enabled = FEATURE_FLAGS[feature]
    const error = new Error(enabled ? '商业服务尚未接入' : '商业功能尚未开放')
    error.code = enabled ? 'COMMERCIAL_PROVIDER_MISSING' : 'COMMERCIAL_DISABLED'
    error.operation = operation
    throw error
  }
}

function usesPaidReport(record) {
  return record?.assessment_type === ASSESSMENT_TYPES.PROFESSIONAL ||
    record?.questionnaire_id === 'career-interest-professional'
}

function getReportAdUnit(record, flags = FEATURE_FLAGS, settings = config) {
  const id = settings.standardReportAdUnitId
  return !usesPaidReport(record) && flags.advertising && /^adunit-[a-z0-9]+$/i.test(id) ? id : ''
}

function getBasicReportAdUnit(record, flags = FEATURE_FLAGS, settings = config) {
  const id = settings.professionalBasicAdUnitId
  return usesPaidReport(record) && flags.advertising && /^adunit-[a-z0-9]+$/i.test(id) ? id : ''
}

function requiresBasicReportUnlock(record) {
  return usesPaidReport(record) && record.basic_report_ad_completed !== true
}

async function watchBasicReportAd(adUnitId, platform = wx) {
  if (!/^adunit-[a-z0-9]+$/i.test(adUnitId) || typeof platform.createRewardedVideoAd !== 'function') {
    throw new Error('当前环境无法播放解锁广告')
  }
  const ad = platform.createRewardedVideoAd({ adUnitId })
  return new Promise((resolve, reject) => {
    function cleanup() {
      ad.offClose?.(onClose)
      ad.offError?.(onError)
    }
    function onClose(result) {
      cleanup()
      resolve(result?.isEnded === true)
    }
    function onError(error) {
      cleanup()
      reject(error)
    }
    ad.onClose(onClose)
    ad.onError(onError)
    Promise.resolve().then(() => ad.load()).then(() => ad.show()).catch(onError)
  })
}

function hasValidQuote(quote) {
  return Number.isSafeInteger(quote?.priceFen) && quote.priceFen > 0 &&
    typeof quote.quoteId === 'string' && Boolean(quote.quoteId.trim())
}

function createReportCommerce(flags, settings, platform) {
  const endpoint = String(settings.professionalReportApi || '').replace(/\/+$/, '')
  const available = Boolean(flags.payments && flags.paidReportUnlock && /^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/_-]*)?$/i.test(endpoint))

  function assertAvailable(operation) {
    if (available) return
    const error = new Error('付费报告服务暂未开放')
    error.code = flags.payments && flags.paidReportUnlock ? 'COMMERCIAL_PROVIDER_MISSING' : 'COMMERCIAL_DISABLED'
    error.operation = operation
    throw error
  }

  function call(method, options = {}) {
    return new Promise((resolve, reject) => {
      platform()[method]({ ...options, success: resolve, fail: reject })
    })
  }

  async function request(operation, route, recordId, data = {}) {
    assertAvailable(operation)
    if (typeof recordId !== 'string' || !recordId) throw new Error('测评记录缺失')
    const { code } = await call('login')
    if (!code) throw new Error('无法验证微信会话')
    const response = await call('request', {
      url: `${endpoint}/${route}`,
      method: 'POST',
      timeout: 12000,
      data: { ...data, recordId, code }
    })
    if (response.statusCode !== 200 || response.data?.recordId !== recordId) {
      throw new Error('报告服务暂时不可用')
    }
    return response.data
  }

  async function verifyOrder(recordId) {
    const result = await request('verifyOrder', 'status', recordId)
    if (!['locked', 'pending', 'unlocked'].includes(result.status)) throw new Error('报告状态无效')
    if (result.status === 'locked' && !hasValidQuote(result)) {
      throw new Error('未获取有效报价')
    }
    return result
  }

  async function createOrder(recordId, quote) {
    assertAvailable('createOrder')
    if (typeof platform().requestVirtualPayment !== 'function') throw new Error('当前微信版本不支持购买')
    if (!hasValidQuote(quote)) throw new Error('请先查询本次报告的价格')
    const order = await request('createOrder', 'order', recordId, { quoteId: quote.quoteId, priceFen: quote.priceFen })
    if (order.status === 'unlocked' || order.status === 'pending') return order
    if (order.status === 'locked' || (order.status === 'payable' && order.priceFen !== quote.priceFen)) {
      const error = new Error('价格已变化，请重新查询报价')
      error.code = 'QUOTE_CHANGED'
      throw error
    }
    const payment = order.payment
    if (order.status !== 'payable' ||
        payment?.mode !== 'short_series_goods' || !['signData', 'paySig', 'signature'].every((key) =>
          typeof payment[key] === 'string' && payment[key])) throw new Error('订单无效')
    const { signData, paySig, signature, mode } = payment
    const signedOrder = JSON.parse(signData)
    if (signedOrder?.goodsPrice !== quote.priceFen || signedOrder.buyQuantity !== 1 ||
        typeof signedOrder.outTradeNo !== 'string' || !signedOrder.outTradeNo) {
      throw new Error('签名订单金额或商品数量无效')
    }
    return { ...order, payment: { signData, paySig, signature, mode } }
  }

  async function startPayment(recordId, quote) {
    assertAvailable('startPayment')
    const order = await createOrder(recordId, quote)
    let paymentInterrupted = false
    if (order.status === 'payable') {
      try {
        await call('requestVirtualPayment', order.payment)
      } catch {
        paymentInterrupted = true
      }
    }
    const status = await verifyOrder(recordId)
    if (status.status === 'locked' && (order.status === 'pending' || (order.status === 'payable' && !paymentInterrupted))) {
      return { status: 'pending' }
    }
    return { ...status, paymentInterrupted }
  }

  async function unlockReport(recordId, summary) {
    const response = await request('unlockReport', 'report', recordId, { summary })
    const { report, professionalProfile } = response
    if (response.status !== 'unlocked' || !Array.isArray(report?.profile?.dimensions) ||
        !Array.isArray(report?.plan?.milestones) || !Array.isArray(report?.careers) ||
        !Array.isArray(professionalProfile)) throw new Error('完整报告暂不可用')
    return { report, professionalProfile }
  }

  return { available, createOrder, startPayment, verifyOrder, unlockReport }
}

module.exports = {
  usesPaidReport,
  getReportAdUnit,
  getBasicReportAdUnit,
  requiresBasicReportUnlock,
  watchBasicReportAd,
  createReportCommerce,
  ...createReportCommerce(FEATURE_FLAGS, config, () => wx),
  showAd: reserveOperation('showAd', 'advertising'),
  requestRefund: reserveOperation('requestRefund', 'payments')
}
