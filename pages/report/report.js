const { FEATURE_FLAGS } = require('../../config/product')
const { buildDeepReport } = require('../../services/report-service')
const storage = require('../../utils/storage')
const { formatDate } = require('../../utils/format')
const { getTypeRepresentatives } = require('../../services/knowledge-service')

Page({
  data: {
    enabled: FEATURE_FLAGS.deepReport,
    report: null,
    representatives: [],
    recordId: '',
    savedHorizon: '',
    completedAtText: '',
    horizon: '90',
    milestones: []
  },

  onLoad({ id } = {}) {
    if (!this.data.enabled || typeof id !== 'string' || !id) return
    const record = storage.getRecord(id)
    if (!record) return
    const saved = storage.getSavedReport(id)
    const report = saved?.report || buildDeepReport(record)
    if (!report) return
    const horizon = saved?.horizon === '180' ? '180' : '90'

    this.setData({
      report,
      representatives: getTypeRepresentatives(report.profile.dimensions),
      recordId: id,
      horizon,
      savedHorizon: saved ? horizon : '',
      completedAtText: formatDate(record.created_at ?? record.completedAt),
      milestones: report.plan.milestones.slice(0, horizon === '90' ? 3 : 6)
    })
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
    if (!recordId || !report || horizon === savedHorizon) return
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
