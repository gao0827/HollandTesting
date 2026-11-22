const storage = require('../../utils/storage')
const { RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { FEATURE_FLAGS } = require('../../config/product')
const { buildInterestProfile } = require('../../services/report-service')
const { getTypeRepresentatives } = require('../../services/knowledge-service')

Page({
  data: {
    knowledgeEnabled: FEATURE_FLAGS.knowledgeBase,
    record: null,
    primary: null,
    topTypes: [],
    dimensions: [],
    representatives: [],
    combinationSummary: '',
    reportUrl: '',
    leadingText: '',
    tieNotes: [],
    completedAtText: '',
    loadFailed: false
  },

  onLoad(options) {
    this.loadRecord(options.id)
  },

  loadRecord(id) {
    const record = storage.getRecord(id)
    if (!record || !record.primaryCode || !RIASEC[record.primaryCode]) {
      this.setData({ loadFailed: true })
      return
    }

    const ranking = (record.dimensions || []).filter((item) => RIASEC[item.code]).sort((a, b) => {
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore
      return a.order - b.order
    })

    if (!ranking.length) {
      this.setData({ loadFailed: true })
      return
    }

    const groups = []
    ranking.forEach((item, index) => {
      const previous = groups[groups.length - 1]
      if (previous && previous.score === item.rawScore) {
        previous.codes.push(item.code)
      } else {
        groups.push({ score: item.rawScore, rank: index + 1, codes: [item.code] })
      }
    })
    const topTypes = ranking.slice(0, 3).map((item) => {
      const meta = RIASEC[item.code]
      const group = groups.find((entry) => entry.codes.includes(item.code))
      return Object.assign({}, item, meta, {
        rank: group.codes.length > 1 ? `并列第 ${group.rank}` : `第 ${group.rank}`,
        strengthsText: meta.strengths.join('、'),
        careersText: meta.careers.join('、')
      })
    })

    const dimensions = record.dimensions.filter((item) => RIASEC[item.code]).map((item) => Object.assign({}, item, {
      color: RIASEC[item.code].color,
      lightColor: RIASEC[item.code].lightColor,
      shortName: RIASEC[item.code].shortName
    }))
    const profile = buildInterestProfile(record)
    const reportUrl = FEATURE_FLAGS.deepReport && profile && record.id
      ? `/pages/report/report?id=${encodeURIComponent(record.id)}`
      : ''

    this.setData({
      record,
      primary: RIASEC[record.primaryCode],
      topTypes,
      dimensions,
      representatives: getTypeRepresentatives(dimensions),
      combinationSummary: profile ? profile.summary : '',
      reportUrl,
      leadingText: groups[0].codes.map((code) => RIASEC[code].name).join('、'),
      tieNotes: groups.filter((group) => group.codes.length > 1).map((group) =>
        `${group.codes.join('、')} 并列第 ${group.rank} 名`
      ),
      completedAtText: formatDate(record.completedAt),
      loadFailed: false
    })
  },

  startAgain() {
    wx.navigateTo({ url: '/pages/selection/selection?assessmentType=standard' })
  },

  openReport() {
    if (this.data.reportUrl) wx.navigateTo({ url: this.data.reportUrl })
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return {
      title: '职趣测评｜发现你的职业兴趣倾向',
      path: '/pages/index/index'
    }
  }
})
