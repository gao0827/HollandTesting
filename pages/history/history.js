const storage = require('../../utils/storage')
const { RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { USER_TYPE_LABELS, ASSESSMENT_TYPE_LABELS } = require('../../services/assessment-selection')
const { requiresBasicReportUnlock } = require('../../services/commercial-service')

Page({
  data: {
    records: [],
    loadFailed: false
  },

  onShow() {
    this.loadRecords()
  },

  loadRecords() {
    let reportIds
    try {
      reportIds = new Set(storage.getDataSummary().reportIds)
    } catch (error) {
      this.setData({ loadFailed: true })
      return
    }

    const records = storage.readHistory()
      .filter((record) => record && record.primaryCode && RIASEC[record.primaryCode])
      .map((record) => {
        const basicLocked = requiresBasicReportUnlock(record)
        return {
          id: record.id,
          code: basicLocked ? '250' : record.code,
          primaryName: basicLocked ? '' : RIASEC[record.primaryCode].name,
          primaryColor: basicLocked ? '#475569' : RIASEC[record.primaryCode].color,
          primaryLightColor: basicLocked ? '#e2e8f0' : RIASEC[record.primaryCode].lightColor,
          userTypeLabel: [USER_TYPE_LABELS[record.user_type], ASSESSMENT_TYPE_LABELS[record.assessment_type]].filter(Boolean).join(' · '),
          hasSavedReport: reportIds.has(record.id),
          completedAtText: formatDate(record.completedAt)
        }
      })

    this.setData({ records, loadFailed: false })
  },

  openRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/history-detail/history-detail?id=${encodeURIComponent(id)}` })
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '本次测评记录及其已保存报告将永久删除。',
      confirmText: '删除',
      confirmColor: '#BE123C',
      success: (result) => {
        if (!result.confirm) return
        this.applyDeletion(() => storage.removeRecord(id), '已删除')
      }
    })
  },

  clearAll() {
    if (!this.data.records.length) return
    wx.showModal({
      title: '清空全部记录？',
      content: '所有历史测评记录和已保存报告会被删除，答题草稿会保留。',
      confirmText: '全部清空',
      confirmColor: '#BE123C',
      success: (result) => {
        if (!result.confirm) return
        this.applyDeletion(storage.clearHistory, '已清空')
      }
    })
  },

  applyDeletion(action, title) {
    try {
      action()
      this.loadRecords()
      wx.showToast({ title, icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  },

  startAssessment() {
    wx.navigateTo({ url: '/pages/selection/selection?assessmentType=standard' })
  },

  openDataSettings() {
    wx.navigateTo({ url: '/pages/data-settings/data-settings' })
  }
})
