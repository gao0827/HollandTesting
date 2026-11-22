const storage = require('../../utils/storage')
const { DIMENSION_ORDER, RIASEC } = require('../../data/riasec')
const { formatDate } = require('../../utils/format')
const { ASSESSMENT_TYPES, FEATURE_FLAGS } = require('../../config/product')
const { USER_TYPE_LABELS, ASSESSMENT_TYPE_LABELS, normalizeUserType } = require('../../services/assessment-selection')
const standardQuestionnaire = require('../../data/questionnaire-standard')
const { questionnaire: professionalQuestionnaire } = require('../../data/questionnaire-professional')
const { requiresBasicReportUnlock } = require('../../services/commercial-service')

Page({
  data: {
    knowledgeEnabled: FEATURE_FLAGS.knowledgeBase,
    hasDraft: false,
    draftAnswered: 0,
    draftLabel: '',
    draftUserType: '',
    recentRecord: null,
    standardQuestionCount: standardQuestionnaire.item_count,
    professionalQuestionCount: professionalQuestionnaire.item_count,
    professionalAvailable: FEATURE_FLAGS.professionalAssessment,
    draftIsProfessional: false,
    typeCards: DIMENSION_ORDER.map((code) => RIASEC[code])
  },

  onShow() {
    const draft = storage.getDraft()
    const recent = storage.getRecord()
    let recentRecord = null

    if (recent && recent.primaryCode && RIASEC[recent.primaryCode]) {
      const basicLocked = requiresBasicReportUnlock(recent)
      recentRecord = {
        id: recent.id,
        basicLocked,
        code: basicLocked ? '' : recent.code,
        primaryName: basicLocked ? '' : RIASEC[recent.primaryCode].name,
        completedAtText: formatDate(recent.completedAt)
      }
    }

    this.setData({
      hasDraft: Boolean(draft && draft.answers && Object.keys(draft.answers).length),
      draftAnswered: draft && draft.answers ? Object.keys(draft.answers).length : 0,
      draftLabel: draft ? [ASSESSMENT_TYPE_LABELS[draft.assessment_type], USER_TYPE_LABELS[draft.user_type]].filter(Boolean).join(' · ') || '旧版草稿' : '',
      draftUserType: normalizeUserType(draft?.user_type),
      draftIsProfessional: draft?.assessment_type === 'professional',
      recentRecord
    })
  },

  startAssessment() {
    this.openAssessmentSelection(ASSESSMENT_TYPES.STANDARD)
  },

  openProfessionalAssessment() {
    this.openAssessmentSelection(ASSESSMENT_TYPES.PROFESSIONAL)
  },

  openAssessmentSelection(assessmentType) {
    const sameVersion = this.data.draftIsProfessional === (assessmentType === ASSESSMENT_TYPES.PROFESSIONAL)
    const role = this.data.hasDraft && sameVersion ? this.data.draftUserType : ''
    wx.navigateTo({
      url: `/pages/selection/selection?assessmentType=${assessmentType}${role ? `&userType=${role}` : ''}`
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
