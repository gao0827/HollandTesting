const storage = require('../../utils/storage')
const { RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { FEATURE_FLAGS } = require('../../config/product')
const { USER_TYPE_LABELS } = require('../../services/assessment-selection')
const standardQuestionnaire = require('../../data/questionnaire-standard')

Page({
  data: {
    knowledgeEnabled: FEATURE_FLAGS.knowledgeBase,
    hasDraft: false,
    draftAnswered: 0,
    draftLabel: '',
    recentRecord: null,
    standardQuestionCount: standardQuestionnaire.item_count,
    typeCards: [
      { code: 'R', name: '现实型', caption: '动手与实作', className: 'type-r' },
      { code: 'I', name: '研究型', caption: '分析与探索', className: 'type-i' },
      { code: 'A', name: '艺术型', caption: '创意与表达', className: 'type-a' },
      { code: 'S', name: '社会型', caption: '助人与沟通', className: 'type-s' },
      { code: 'E', name: '企业型', caption: '影响与推动', className: 'type-e' },
      { code: 'C', name: '常规型', caption: '秩序与细节', className: 'type-c' }
    ]
  },

  onShow() {
    const draft = storage.getDraft()
    const recent = storage.getRecord()
    let recentRecord = null

    if (recent && recent.primaryCode && RIASEC[recent.primaryCode]) {
      recentRecord = {
        id: recent.id,
        code: recent.code,
        primaryName: RIASEC[recent.primaryCode].name,
        completedAtText: formatDate(recent.completedAt)
      }
    }

    this.setData({
      hasDraft: Boolean(draft && draft.answers && Object.keys(draft.answers).length),
      draftAnswered: draft && draft.answers ? Object.keys(draft.answers).length : 0,
      draftLabel: draft ? (USER_TYPE_LABELS[draft.user_type] || '旧版草稿') : '',
      recentRecord
    })
  },

  startAssessment() {
    wx.navigateTo({
      url: '/pages/selection/selection?assessmentType=standard'
    })
  },

  openProfessionalAssessment() {
    wx.navigateTo({
      url: '/pages/selection/selection?assessmentType=professional'
    })
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  openInterestType(event) {
    if (!this.data.knowledgeEnabled) return
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/knowledge/knowledge?type=${type}` })
  },

  openAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  openRecent() {
    if (!this.data.recentRecord) return
    wx.navigateTo({
      url: `/pages/result/result?id=${encodeURIComponent(this.data.recentRecord.id)}`
    })
  },

  onShareAppMessage() {
    return {
      title: '职趣测评｜发现你的职业兴趣倾向',
      path: '/pages/index/index'
    }
  }
})
