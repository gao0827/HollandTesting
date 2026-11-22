const questions = require('../../data/questions')
const standardQuestionnaire = require('../../data/questionnaire-standard')
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
const VALID_RESPONSE_VALUES = new Set(RESPONSE_OPTIONS.map((item) => item.value))

Page({
  data: {
    userTypeLabel: '',
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
  submitted: false,
  resumedDraftId: null,
  lastDraftKey: '',

  onLoad(options = {}) {
    const selection = parseAssessmentSelection(options)
    if (!canStartAssessment(selection)) {
      wx.redirectTo({
        url: '/pages/selection/selection?assessmentType=standard'
      })
      return
    }

    this.selection = selection
    this.setData({ userTypeLabel: selection.userTypeLabel })

    const draft = storage.getDraft(selection)
    const compatibility = getDraftCompatibility(draft, standardQuestionnaire, selection)

    if (compatibility === 'empty') {
      this.loadAssessment({}, 0)
      return
    }

    const draftId = storage.getDraftId(draft)
    if (['questionnaire_mismatch', 'version_mismatch', 'schema_mismatch'].includes(compatibility)) {
      wx.showModal({
        title: '题库版本已更新',
        content: '原答题进度与当前 60 题版本不兼容，不能混合计分。你可以使用新题库重新开始，已完成的历史记录不会受到影响。',
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

    const normalizedAnswers = normalizeAnswers(questions, draft.answers, standardQuestionnaire)
    const answeredCount = countAnswered(questions, normalizedAnswers, standardQuestionnaire)

    wx.showModal({
      title: compatibility === 'legacy' ? '继续旧版答题进度？' : '继续上次测评？',
      content: `已完成 ${answeredCount} / ${questions.length} 题。继续后会按当前身份保存。`,
      confirmText: '继续作答',
      cancelText: '重新开始',
      success: (result) => {
        if (result.confirm) {
          this.resumedDraftId = draftId
          this.loadAssessment(normalizedAnswers, getResumeIndex(draft, questions))
        } else {
          this.restartAssessment(draftId)
        }
      }
    })
  },

  restartAssessment(draftId) {
    try {
      storage.clearDraft(draftId)
      this.resumedDraftId = null
      this.lastDraftKey = ''
      this.loadAssessment({}, 0)
    } catch (error) {
      wx.showToast({ title: '暂时无法删除答题草稿', icon: 'none' })
      wx.navigateBack()
    }
  },

  loadAssessment(answers, index) {
    this.answers = normalizeAnswers(questions, answers, standardQuestionnaire)
    const safeIndex = Math.min(questions.length - 1, Math.max(0, index))
    this.updateQuestion(safeIndex)
  },

  updateQuestion(index) {
    const question = questions[index]
    const currentAnswer = Number(this.answers[question.id]) || 0
    const responseOptions = RESPONSE_OPTIONS.map((item) => ({
      value: item.value,
      label: item.label,
      selected: item.value === currentAnswer
    }))

    this.setData({
      currentIndex: index,
      currentNumber: index + 1,
      currentQuestion: question,
      currentAnswer,
      answeredCount: countAnswered(questions, this.answers, standardQuestionnaire),
      progress: Math.round(((index + 1) / questions.length) * 100),
      responseOptions,
      canGoBack: index > 0,
      isLast: index === questions.length - 1
    })
  },

  selectAnswer(event) {
    const value = Number(event.currentTarget.dataset.value)
    if (!VALID_RESPONSE_VALUES.has(value) || !this.data.currentQuestion) return

    this.answers[this.data.currentQuestion.id] = value
    this.saveCurrentDraft(this.data.currentIndex)
    this.updateQuestion(this.data.currentIndex)
  },

  saveCurrentDraft(currentIndex) {
    if (!this.selection) return
    const draft = createDraftSnapshot({
      questionnaire: standardQuestionnaire,
      selection: this.selection,
      questions,
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
      wx.showToast({ title: '请先选择你的真实感受', icon: 'none' })
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
    if (!isComplete(questions, this.answers)) {
      const missingIndex = questions.findIndex((question) => !this.answers[question.id])
      if (missingIndex >= 0) this.updateQuestion(missingIndex)
      wx.showToast({ title: '还有题目没有完成', icon: 'none' })
      return
    }

    const result = calculateResult(questions, this.answers, {
      scoringVersion: standardQuestionnaire.scoring_version
    })
    const completedAt = Date.now()
    const record = createCompletedAssessmentRecord({
      questionnaire: standardQuestionnaire,
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
