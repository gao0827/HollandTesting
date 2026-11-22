const storage = require('../../utils/storage')
const { RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { requiresBasicReportUnlock } = require('../../services/commercial-service')

Page({
  data: {
    record: null,
    primary: null,
    basicLocked: false,
    dimensions: [],
    topTypes: [],
    completedAtText: '',
    savedReportUrl: '',
    loadFailed: false
  },

  onLoad({ id } = {}) {
    this.recordId = id
  },

  onShow() {
    const record = this.recordId ? storage.getRecord(this.recordId) : null
    if (!record || !record.primaryCode || !RIASEC[record.primaryCode]) {
      this.setData({ loadFailed: true })
      return
    }
    if (requiresBasicReportUnlock(record)) {
      this.setData({ basicLocked: true, record: { id: record.id }, completedAtText: formatDate(record.completedAt), loadFailed: false })
      return
    }

    const dimensions = (record.dimensions || []).map((item) => Object.assign({}, item, {
      color: RIASEC[item.code].color,
      lightColor: RIASEC[item.code].lightColor
    }))
    const topTypes = dimensions.slice().sort((a, b) => {
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore
      return a.order - b.order
    }).slice(0, 3).map((item) => ({
      code: item.code,
      name: RIASEC[item.code].name,
      color: RIASEC[item.code].color,
      lightColor: RIASEC[item.code].lightColor
    }))

    this.setData({
      record,
      basicLocked: false,
      primary: RIASEC[record.primaryCode],
      dimensions,
      topTypes,
      savedReportUrl: storage.getSavedReport(record.id)
        ? `/pages/report/report?id=${encodeURIComponent(record.id)}`
        : '',
      completedAtText: formatDate(record.completedAt),
      loadFailed: false
    })
  },

  viewFullResult() {
    if (!this.data.record) return
    wx.navigateTo({ url: `/pages/result/result?id=${encodeURIComponent(this.data.record.id)}` })
  },

  goBack() {
    wx.navigateBack()
  }
})
