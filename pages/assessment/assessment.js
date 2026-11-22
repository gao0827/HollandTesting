const questions = require('../../data/questions')
const standardQuestionnaire = require('../../data/questionnaire-standard')
const professional = require('../../data/questionnaire-professional')
const { ASSESSMENT_TYPES } = require('../../config/product')
const { calculateProfessionalResult, isProfessionalAnswer } = require('../../services/professional-scoring')
const { calculateResult, isComplete } = require('../../utils/scoring')
const storage = require('../../utils/storage')
const {
  parseAssessmentSelection,
  canStartAssessment
} = require('../../services/assessment-selection')
const {
  normalizeAnswers,
  countAnswered,
  getResumeIndex,
  getDraftCompatibility,
  createDraftSnapshot
} = require('../../services/assessment-draft')
const { createCompletedAssessmentRecord } = require('../../models/assessment-record')

const RESPONSE_OPTIONS = standardQuestionnaire.response_options.map((item) => ({
  value: item.value,
  label: item.label
}))
const STANDARD = { questionnaire: standardQuestionnaire, questions }

Page({
  data: {
    userTypeLabel: '',
    assessmentTypeLabel: '标准版',
    sectionLabel: '',
    questionPrompt: '',
    questionPrefix: '我会喜欢……',
    total: questions.length,
    currentIndex: 0,
    currentNumber: 1,
    currentQuestion: null,
    currentAnswer: 0,
    answeredCount: 0,
    draftSaveFailed: false,
    progress: 0,
    responseOptions: RESPONSE_OPTIONS,
    canGoBack: false,
    isLast: false
  },

  answers: {},
  selection: null,
  testDefinition: STANDARD,
  submitted: false,
  resumedDraftId: null,
  lastDraftKey: '',

  onLoad(options = {}) {
    const selection = parseAssessmentSelection(options)
    if (!canStartAssessment(selection)) {
      wx.redirectTo({
        url: `/pages/selection/selection?assessmentType=${selection.assessmentType}`
      })
      return
    }

    this.selection = selection
    const draft = storage.getDraft(selection)
    if (selection.assessmentType === ASSESSMENT_TYPES.PROFESSIONAL) {
      const legacy = professional.legacy
      const usesLegacy = draft?.questionnaire_version === legacy.questionnaire.questionnaire_version
        && getDraftCompatibility(draft, legacy.questionnaire, selection) === 'compatible'
      this.testDefinition = usesLegacy ? legacy : professional
    } else {
      this.testDefinition = STANDARD
    }
    const { questionnaire, questions: items } = this.testDefinition
    this.setData({
      userTypeLabel: selection.userTypeLabel,
      assessmentTypeLabel: selection.assessmentTypeLabel,
      total: items.length
    })

    const compatibility = getDraftCompatibility(draft, questionnaire, selection)

    if (compatibility === 'empty') {
      this.loadAssessment({}, 0)
      return
    }

    const draftId = storage.getDraftId(draft)
    if (['questionnaire_mismatch', 'version_mismatch', 'schema_mismatch'].includes(compatibility)) {
      wx.showModal({
        title: '题库版本已更新',
        content: '原答题进度与当前题库不兼容，不能混合计分。你可以使用新题库重新开始，已完成的历史记录不会受到影响。',
        confirmText: '使用新题库',
        cancelText: '返回选择',
        success: (result) => {
          if (result.confirm) {
            this.restartAssessment(draftId)
          } else {
            wx.navigateBack()
          }
        }
      })
      return
    }

    const normalizedAnswers = normalizeAnswers(items, draft.answers, questionnaire)
    const answeredCount = Object.keys(normalizedAnswers).length
    const usesLegacyProfessional = this.testDefinition === professional.legacy

    wx.showModal({
      title: usesLegacyProfessional || compatibility === 'legacy' ? '继续旧版答题进度？' : '继续上次测评？',
      content: usesLegacyProfessional
        ? `已完成 ${answeredCount} / ${items.length} 题。可以按原题目续答，改用新版会清空本次答题进度。`
        : `已完成 ${answeredCount} / ${items.length} 题。继续后会按当前身份保存。`,
      confirmText: '继续作答',
      cancelText: usesLegacyProfessional ? '改用新版' : '重新开始',
      success: (result) => {
        if (result.confirm) {
          this.resumedDraftId = draftId
          this.loadAssessment(normalizedAnswers, getResumeIndex(draft, items))
        } else {
          this.restartAssessment(draftId)
        }
      }
    })
  },

  restartAssessment(draftId) {
    try {
      storage.clearDraft(draftId)
      if (this.testDefinition === professional.legacy) this.testDefinition = professional
      this.resumedDraftId = null
      this.lastDraftKey = ''
      this.loadAssessment({}, 0)
    } catch (error) {
      wx.showToast({ title: '暂时无法删除答题草稿', icon: 'none' })
      wx.navigateBack()
    }
  },

  loadAssessment(answers, index) {
    const { questions: items, questionnaire } = this.testDefinition
    this.answers = normalizeAnswers(items, answers, questionnaire)
    const safeIndex = Math.min(items.length - 1, Math.max(0, index))
    this.updateQuestion(safeIndex)
  },

  updateQuestion(index) {
    const { questions: items, questionnaire, sections } = this.testDefinition
    const question = items[index]
    const section = sections?.find((entry) => entry.id === question.section)
    const currentAnswer = Number(this.answers[question.id]) || 0
    const responseOptions = question.options.map((item) => ({
      value: item.value,
      label: item.label,
      selected: item.value === currentAnswer
    }))

    this.setData({
      currentIndex: index,
      currentNumber: index + 1,
      currentQuestion: question,
      sectionLabel: section?.label || '',
      questionPrompt: section?.prompt || '请按真实兴趣作答，而不是按能力或期待作答',
      questionPrefix: !section || section.id === 'interest' ? '我会喜欢……' : '',
      currentAnswer,
      answeredCount: countAnswered(items, this.answers, questionnaire),
      progress: Math.round(((index + 1) / items.length) * 100),
      responseOptions,
      canGoBack: index > 0,
      isLast: index === items.length - 1
    })
  },

  selectAnswer(event) {
    const value = Number(event.currentTarget.dataset.value)
    if (!this.data.currentQuestion || !isProfessionalAnswer(this.data.currentQuestion, value)) return

    this.answers[this.data.currentQuestion.id] = value
    this.saveCurrentDraft(this.data.currentIndex)
    this.updateQuestion(this.data.currentIndex)
  },

  saveCurrentDraft(currentIndex) {
    if (!this.selection) return
    const { questionnaire, questions: items } = this.testDefinition
    const draft = createDraftSnapshot({
      questionnaire,
      selection: this.selection,
      questions: items,
      answers: this.answers,
      currentIndex,
      updatedAt: Date.now()
    })
    const draftKey = JSON.stringify([draft.currentIndex, draft.answers])
    if (this.lastDraftKey === draftKey) return
    try {
      storage.saveDraft(draft, this.resumedDraftId)
      this.resumedDraftId = null
      this.lastDraftKey = draftKey
      if (this.data.draftSaveFailed) this.setData({ draftSaveFailed: false })
    } catch (error) {
      if (!this.data.draftSaveFailed) this.setData({ draftSaveFailed: true })
    }
  },

  goPrevious() {
    if (!this.data.canGoBack) return
    const previousIndex = this.data.currentIndex - 1
    this.saveCurrentDraft(previousIndex)
    this.updateQuestion(previousIndex)
  },

  goNext() {
    if (!this.data.currentAnswer) {
      wx.showToast({ title: '请先选择一项答案', icon: 'none' })
      return
    }

    if (this.data.isLast) {
      this.submitAssessment()
      return
    }

    const nextIndex = this.data.currentIndex + 1
    this.saveCurrentDraft(nextIndex)
    this.updateQuestion(nextIndex)
  },

  submitAssessment() {
    if (this.submitted) return
    const { questions: items, questionnaire } = this.testDefinition
    const isProfessional = questionnaire.assessment_type === ASSESSMENT_TYPES.PROFESSIONAL
    const complete = isProfessional
      ? items.every((question) => isProfessionalAnswer(question, this.answers[question.id]))
      : isComplete(questions, this.answers)
    if (!complete) {
      const missingIndex = items.findIndex((question) => !isProfessionalAnswer(question, this.answers[question.id]))
      if (missingIndex >= 0) this.updateQuestion(missingIndex)
      wx.showToast({ title: '还有题目没有完成', icon: 'none' })
      return
    }

    const result = isProfessional
      ? calculateProfessionalResult(this.answers, this.testDefinition)
      : calculateResult(questions, this.answers, { scoringVersion: standardQuestionnaire.scoring_version })
    const completedAt = Date.now()
    const record = createCompletedAssessmentRecord({
      questionnaire,
      selection: this.selection,
      answers: this.answers,
      result,
      completedAt
    })

    try {
      storage.saveRecord(record, [storage.getDraftId(this.selection), this.resumedDraftId])
    } catch (error) {
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
      return
    }
    this.submitted = true

    wx.redirectTo({
      url: `/pages/result/result?id=${record.id}`
    })
  },

  persistDraftIfNeeded() {
    if (this.submitted || !this.selection || !Object.keys(this.answers).length) return
    this.saveCurrentDraft(this.data.currentIndex)
  },

  onHide() {
    this.persistDraftIfNeeded()
  },

  onUnload() {
    this.persistDraftIfNeeded()
  }
})
