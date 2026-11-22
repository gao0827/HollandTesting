const { FEATURE_FLAGS } = require('../../config/product')
const { professionalReportPriceFen } = require('../../config/commercial')
const { buildDeepReport, buildInterestProfile } = require('../../services/report-service')
const { buildProfessionalProfile } = require('../../services/professional-scoring')
const { buildProfessionalDecisionSteps } = require('../../services/professional-reading')
const { buildProfessionalSummary } = require('../../services/professional-summary')
const { USER_TYPE_LABELS } = require('../../services/assessment-selection')
const storage = require('../../utils/storage')
const { formatDate } = require('../../utils/format')
const { getTypeRepresentatives } = require('../../services/knowledge-service')
const commerce = require('../../services/commercial-service')

function formatPrice(priceFen) {
  return `¥${(priceFen / 100).toFixed(2)}`
}

function canPreviewLocalReport() {
  try {
    const account = wx.getAccountInfoSync?.()
    const device = wx.getDeviceInfo?.() || wx.getSystemInfoSync?.()
    return account?.miniProgram?.envVersion === 'develop' && device?.platform === 'devtools'
  } catch {
    return false
  }
}

Page({
  data: {
    enabled: FEATURE_FLAGS.deepReport,
    report: null,
    paidReport: false,
    checkoutAvailable: false,
    checkoutNotice: '',
    canPreview: false,
    previewMode: false,
    checkoutState: '',
    checkoutError: '',
    orderReference: '',
    busy: false,
    configuredPriceText: formatPrice(professionalReportPriceFen),
    priceText: '',
    adUnitId: '',
    representatives: [],
    professionalProfile: [],
    decisionSteps: [],
    recordId: '',
    resultUrl: '',
    roleLabel: '',
    savedHorizon: '',
    completedAtText: '',
    horizon: '90',
    milestones: []
  },

  onLoad({ id } = {}) {
    if (!this.data.enabled || typeof id !== 'string' || !id) return
    const record = storage.getRecord(id)
    if (!record) return
    this.recordId = id
    if (commerce.usesPaidReport(record)) {
      const hasCompleteProfile = Boolean(buildProfessionalSummary(record))
      const checkoutAvailable = commerce.available && hasCompleteProfile
      this.setData({
        paidReport: true,
        recordId: id,
        checkoutAvailable,
        checkoutNotice: hasCompleteProfile
          ? '购买服务尚未开通。'
          : '这条记录缺少部分补充分数。完成新版 250 题后可生成完整画像。',
        canPreview: !commerce.available && canPreviewLocalReport(),
        resultUrl: `/pages/result/result?id=${encodeURIComponent(id)}`,
        roleLabel: USER_TYPE_LABELS[record.user_type] || '',
        completedAtText: formatDate(record.created_at ?? record.completedAt)
      })
      if (checkoutAvailable) return this.refreshOrder()
      return
    }
    const saved = storage.getSavedReport(id)
    const report = saved?.report || buildDeepReport(record)
    if (!report) return
    this.renderReport(record, report, [], saved)
    this.setData({ adUnitId: commerce.getReportAdUnit(record) })
  },

  renderReport(record, report, professionalProfile, saved, decisionSteps = []) {
    const horizon = saved?.horizon === '180' ? '180' : '90'
    this.setData({
      report,
      representatives: getTypeRepresentatives(report.profile.dimensions),
      professionalProfile,
      decisionSteps,
      recordId: record.id,
      horizon,
      savedHorizon: saved ? horizon : '',
      completedAtText: formatDate(record.created_at ?? record.completedAt),
      milestones: report.plan.milestones.slice(0, horizon === '90' ? 3 : 6)
    })
  },

  renderProfessionalReport(record, report, providerProfile = []) {
    const localProfile = buildProfessionalProfile(record)
    const localIds = new Set(localProfile.map((section) => section.id))
    const fullProfile = [...localProfile, ...providerProfile.filter((section) => section?.id && !localIds.has(section.id))]
    const decisionSteps = buildProfessionalDecisionSteps(buildInterestProfile(record), fullProfile, record.user_type)
    this.renderReport(record, report, fullProfile, undefined, decisionSteps)
  },

  openLocalPreview() {
    if (!this.data.paidReport || commerce.available || !canPreviewLocalReport()) return
    const record = storage.getRecord(this.recordId)
    const report = commerce.usesPaidReport(record) && buildDeepReport(record)
    if (!report) {
      this.setData({ checkoutError: '该测评记录缺少生成报告所需的分数。' })
      return
    }
    this.renderProfessionalReport(record, report)
    this.setData({ previewMode: true, checkoutError: '' })
  },

  closeLocalPreview() {
    this.setData({ previewMode: false, report: null, decisionSteps: [], professionalProfile: [], representatives: [], milestones: [] })
  },

  hideAd() {
    this.setData({ adUnitId: '' })
  },

  setCheckout(status) {
    this.quote = status.status === 'locked' ? status : null
    const orderReference = typeof status.orderId === 'string' && /^[a-z0-9_-]{8,32}$/i.test(status.orderId)
      ? status.orderId
      : ''
    this.setData({
      checkoutState: status.status,
      priceText: this.quote ? formatPrice(this.quote.priceFen) : '',
      orderReference: orderReference || (status.status === 'pending' ? this.data.orderReference : '')
    })
  },

  copyOrderReference() {
    if (this.data.orderReference) wx.setClipboardData({ data: this.data.orderReference })
  },

  async refreshOrder() {
    if (!this.data.paidReport || !this.data.checkoutAvailable || this.data.busy) return
    this.setData({ busy: true, checkoutError: '' })
    try {
      this.setCheckout(await commerce.verifyOrder(this.recordId))
    } catch (error) {
      this.setCheckout({ status: this.data.checkoutState === 'pending' ? 'pending' : '' })
      this.setData({ checkoutError: '暂时无法查询购买状态，请重试。' })
    } finally {
      this.setData({ busy: false })
    }
  },

  async buyReport() {
    if (!this.quote || this.data.busy || this.data.checkoutState !== 'locked') return
    if (!buildProfessionalSummary(storage.getRecord(this.recordId))) {
      this.setData({ checkoutError: '这条测评记录缺少可用于生成报告的分数。' })
      return
    }
    this.setData({ busy: true, checkoutError: '' })
    try {
      const status = await commerce.startPayment(this.recordId, this.quote)
      this.setCheckout(status)
      if (status.paymentInterrupted && status.status === 'locked') {
        this.setData({ checkoutError: '本次支付未完成。确认金额后可以重新购买。' })
      }
    } catch (error) {
      if (error.code === 'PAYMENT_UNSUPPORTED') {
        this.setData({ checkoutError: '请更新微信后购买。已购买的报告可以继续查询。' })
        return
      }
      const quoteChanged = error.code === 'QUOTE_CHANGED'
      this.setCheckout({ status: quoteChanged ? '' : 'pending', orderId: error.orderId })
      this.setData({
        checkoutError: quoteChanged ? '订单状态或报价已更新，请重新查询价格。' : '暂时无法确认订单，请先查询购买状态。'
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  async loadPurchasedReport() {
    if (this.data.checkoutState !== 'unlocked' || this.data.busy) return
    const record = storage.getRecord(this.recordId)
    if (!record || !commerce.usesPaidReport(record)) return
    const summary = buildProfessionalSummary(record)
    if (!summary) {
      this.setData({ checkoutError: '本地记录缺少生成报告所需的分数。' })
      return
    }
    this.setData({ busy: true, checkoutError: '' })
    try {
      const { report, professionalProfile } = await commerce.unlockReport(this.recordId, summary)
      this.renderProfessionalReport(record, report, professionalProfile)
    } catch (error) {
      if (error.code === 'REPORT_ENTITLEMENT_CHANGED') {
        this.setCheckout({ status: 'pending' })
        this.setData({ checkoutError: '购买权益待确认，请重新查询订单。' })
      } else if (error.code === 'REPORT_DATA_REJECTED' || error.code === 'REPORT_RECORD_CHANGED') {
        this.setData({ checkoutError: '购买权益已确认。当前分数与报告记录不匹配，请保留本地记录和订单编号。' })
      } else {
        this.setData({ checkoutError: '暂时无法获取报告，请查询购买状态或重试。' })
      }
    } finally {
      this.setData({ busy: false })
    }
  },

  selectHorizon(event) {
    const { horizon } = event.currentTarget.dataset
    const { report } = this.data
    if (!report || (horizon !== '90' && horizon !== '180') || horizon === this.data.horizon) return

    this.setData({
      horizon,
      milestones: report.plan.milestones.slice(0, horizon === '90' ? 3 : 6)
    })
  },

  saveReport() {
    const { recordId, report, horizon, savedHorizon } = this.data
    if (this.data.paidReport || !recordId || !report || horizon === savedHorizon) return
    try {
      storage.saveReport(recordId, report, horizon)
      this.setData({ savedHorizon: horizon })
      wx.showToast({ title: '报告已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '报告保存失败', icon: 'none' })
    }
  },

  deleteSavedReport() {
    if (!this.data.savedHorizon) return
    wx.showModal({
      title: '删除已保存的报告？',
      content: '原测评记录仍会保留，可随时重新生成报告。',
      confirmText: '确认删除',
      confirmColor: '#be123c',
      success: ({ confirm }) => {
        if (!confirm) return
        try {
          storage.removeSavedReport(this.data.recordId)
          this.setData({ savedHorizon: '' })
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '报告删除失败', icon: 'none' })
        }
      }
    })
  }
})
