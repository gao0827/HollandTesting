const storage = require('../../utils/storage')
const { RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { FEATURE_FLAGS } = require('../../config/product')
const { buildInterestProfile } = require('../../services/report-service')
const { buildProfessionalInterestReading } = require('../../services/professional-reading')
const { getTypeRepresentatives } = require('../../services/knowledge-service')
const commerce = require('../../services/commercial-service')

Page({
  data: {
    knowledgeEnabled: FEATURE_FLAGS.knowledgeBase,
    record: null,
    primary: null,
    topTypes: [],
    dimensions: [],
    representatives: [],
    paidReport: false,
    basicLocked: false,
    basicAdUnitId: '',
    basicBusy: false,
    basicRewardPending: false,
    basicError: '',
    combinationSummary: '',
    basicReading: null,
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
    const paidReport = commerce.usesPaidReport(record)
    const basicLocked = commerce.requiresBasicReportUnlock(record)
    const safeRecord = { id: record.id, assessment_type: paidReport ? 'professional' : record.assessment_type }
    const reportUrl = FEATURE_FLAGS.deepReport && record.id
      ? `/pages/report/report?id=${encodeURIComponent(record.id)}`
      : ''
    if (basicLocked) {
      this.setData({
        record: safeRecord,
        paidReport,
        basicLocked,
        basicAdUnitId: commerce.getBasicReportAdUnit(record),
        dimensions: [],
        topTypes: [],
        representatives: [],
        basicReading: null,
        reportUrl,
        completedAtText: formatDate(record.completedAt),
        loadFailed: false
      })
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
        strengthsText: meta.strengths.join('、')
      })
    })

    const dimensions = record.dimensions.filter((item) => RIASEC[item.code]).map((item) => Object.assign({}, item, {
      color: RIASEC[item.code].color,
      lightColor: RIASEC[item.code].lightColor,
      shortName: RIASEC[item.code].shortName
    }))
    const profile = buildInterestProfile(record)
    this.setData({
      record: { ...safeRecord, code: record.code },
      primary: RIASEC[record.primaryCode],
      topTypes,
      dimensions,
      representatives: getTypeRepresentatives(dimensions),
      paidReport,
      basicLocked: false,
      combinationSummary: profile ? profile.summary : '',
      basicReading: paidReport ? buildProfessionalInterestReading(profile, record.user_type) : null,
      reportUrl: profile ? reportUrl : '',
      leadingText: groups[0].codes.map((code) => RIASEC[code].name).join('、'),
      tieNotes: groups.filter((group) => group.codes.length > 1).map((group) =>
        `${group.codes.join('、')} 并列第 ${group.rank} 名`
      ),
      completedAtText: formatDate(record.completedAt),
      loadFailed: false
    })
  },

  async unlockBasicReport() {
    const { basicLocked, basicAdUnitId, basicBusy, record } = this.data
    if (!basicLocked || !basicAdUnitId || basicBusy || !record?.id) return
    this.setData({ basicBusy: true, basicError: '' })
    try {
      if (this.basicRewardRecordId !== record.id) {
        const completed = await commerce.watchBasicReportAd(basicAdUnitId)
        if (!completed) {
          this.setData({ basicError: '完整观看广告后即可解锁基础解读。' })
          return
        }
        this.basicRewardRecordId = record.id
      }
      storage.unlockBasicReport(record.id)
      this.basicRewardRecordId = ''
      this.setData({ basicRewardPending: false })
      this.loadRecord(record.id)
    } catch {
      const rewardPending = this.basicRewardRecordId === record.id
      this.setData({
        basicRewardPending: rewardPending,
        basicError: rewardPending ? '广告已看完，解锁状态暂未保存，请重试。' : '暂时无法播放广告，请稍后重试。'
      })
    } finally {
      this.setData({ basicBusy: false })
    }
  },

  startAgain() {
    const type = this.data.record?.assessment_type === 'professional' ? 'professional' : 'standard'
    wx.navigateTo({ url: `/pages/selection/selection?assessmentType=${type}` })
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
