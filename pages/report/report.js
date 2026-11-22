const { FEATURE_FLAGS } = require('../../config/product')
const { buildDeepReport, buildInterestProfile } = require('../../services/report-service')
const { buildProfessionalProfile } = require('../../services/professional-scoring')
const { buildProfessionalDecisionSteps } = require('../../services/professional-reading')
const { USER_TYPE_LABELS } = require('../../services/assessment-selection')
const storage = require('../../utils/storage')
const { formatDate } = require('../../utils/format')
const { getTypeRepresentatives } = require('../../services/knowledge-service')
const commerce = require('../../services/commercial-service')

Page({
  data: {
    enabled: FEATURE_FLAGS.deepReport,
    report: null,
    paidReport: false,
    checkoutAvailable: false,
    checkoutState: '',
    checkoutError: '',
    busy: false,
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
      this.setData({
        paidReport: true,
        recordId: id,
        checkoutAvailable: commerce.available,
        resultUrl: `/pages/result/result?id=${encodeURIComponent(id)}`,
        roleLabel: USER_TYPE_LABELS[record.user_type] || '',
        completedAtText: formatDate(record.created_at ?? record.completedAt)
      })
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

  hideAd() {
    this.setData({ adUnitId: '' })
  },

  setCheckout(status) {
    this.quote = status.status === 'locked' ? status : null
    this.setData({
      checkoutState: status.status,
      priceText: this.quote ? `¥${(this.quote.priceFen / 100).toFixed(2)}` : ''
    })
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
    this.setData({ busy: true, checkoutError: '' })
    try {
      const status = await commerce.startPayment(this.recordId, this.quote)
      this.setCheckout(status)
      if (status.paymentInterrupted && status.status === 'locked') {
        this.setData({ checkoutError: '本次支付未完成。确认金额后可以重新购买。' })
      }
    } catch (error) {
      const quoteChanged = error.code === 'QUOTE_CHANGED'
      this.setCheckout({ status: quoteChanged ? '' : 'pending' })
      this.setData({
        checkoutError: quoteChanged ? '报价已更新，请重新查询价格并确认购买。' : '暂时无法确认订单，请先查询购买状态。'
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  async loadPurchasedReport() {
    if (this.data.checkoutState !== 'unlocked' || this.data.busy) return
    const record = storage.getRecord(this.recordId)
    if (!record || !commerce.usesPaidReport(record)) return
    this.setData({ busy: true, checkoutError: '' })
    try {
      const { report, professionalProfile } = await commerce.unlockReport(this.recordId, {
        userType: record.user_type,
        questionnaireVersion: record.questionnaire_version,
        scoringVersion: record.scoring_version,
        interestScores: record.riasec_scores,
        professionalScores: record.professional_scores
      })
      const localProfile = buildProfessionalProfile(record)
      const localIds = new Set(localProfile.map((section) => section.id))
      const fullProfile = [...localProfile, ...professionalProfile.filter((section) => section?.id && !localIds.has(section.id))]
      const decisionSteps = buildProfessionalDecisionSteps(buildInterestProfile(record), fullProfile, record.user_type)
      this.renderReport(record, report, fullProfile, undefined, decisionSteps)
    } catch (error) {
      this.setData({ checkoutError: '暂时无法获取报告，请查询购买状态或重试。' })
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
