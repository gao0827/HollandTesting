const {
  USER_TYPES,
  ASSESSMENT_TYPES
} = require('../../config/product')
const {
  ASSESSMENT_ROLE_OPTIONS,
  normalizeAssessmentType,
  parseAssessmentSelection,
  buildAssessmentUrl
} = require('../../services/assessment-selection')
const standard = require('../../data/questionnaire-standard')
const { questionnaire: professional } = require('../../data/questionnaire-professional')
const storage = require('../../utils/storage')

function getSelectableRole(value) {
  return ASSESSMENT_ROLE_OPTIONS.find((role) => role.value === value)?.value || ''
}

Page({
  data: {
    userType: '',
    assessmentType: ASSESSMENT_TYPES.STANDARD,
    userOptions: [],
    legacyDraftUrl: '',
    isAdvisor: false,
    selectedVersionEmblem: '标',
    selectedVersionLabel: '标准版',
    selectedVersionCount: 60,
    selectedVersionStatus: '已开放',
    canContinue: false,
    actionText: '请选择你的角色',
    selectionSummary: '选择将用于生成对应的结果说明与行动建议'
  },

  onLoad(options = {}) {
    const assessmentType = normalizeAssessmentType(options.assessmentType)
    if (options.userType === USER_TYPES.WORKING_PROFESSIONAL) {
      const legacySelection = parseAssessmentSelection(options)
      const draft = storage.getDraft(legacySelection)
      if (draft?.user_type === legacySelection.userType) {
        this.setData({ legacyDraftUrl: buildAssessmentUrl(legacySelection) })
      }
    }
    this.updateSelection(getSelectableRole(options.userType), assessmentType)
  },

  selectUserType(event) {
    this.updateSelection(
      getSelectableRole(event.currentTarget.dataset.value),
      this.data.assessmentType
    )
  },

  updateSelection(userType, assessmentType) {
    const selection = parseAssessmentSelection({ userType, assessmentType })
    const isProfessional = assessmentType === ASSESSMENT_TYPES.PROFESSIONAL
    const canContinue = selection.isUserTypeValid && selection.isAssessmentAvailable
    const count = isProfessional ? professional.item_count : standard.item_count

    this.setData({
      userType,
      assessmentType,
      userOptions: ASSESSMENT_ROLE_OPTIONS.map((item) => Object.assign({}, item, {
        selected: item.value === userType
      })),
      isAdvisor: userType === USER_TYPES.CAREER_ADVISOR,
      selectedVersionEmblem: isProfessional ? '专' : '标',
      selectedVersionLabel: selection.assessmentTypeLabel,
      selectedVersionCount: count,
      selectedVersionStatus: selection.isAssessmentAvailable ? '已开放' : '暂未开放',
      canContinue,
      actionText: !canContinue
        ? '请选择你的角色'
        : `开始${selection.assessmentTypeLabel}测评`,
      selectionSummary: isProfessional
        ? '包含职业兴趣、技能自评、价值观、工作环境和职业愿望。可分多次完成。基础解读看广告，进阶详解单次购买。'
        : [selection.userTypeLabel, `标准版 ${count} 题`, '本地保存进度'].filter(Boolean).join(' · ')
    })
  },

  continueAssessment() {
    const selection = parseAssessmentSelection(this.data)

    if (!selection.isUserTypeValid) {
      wx.showToast({ title: '请先选择你的角色', icon: 'none' })
      return
    }

    const url = buildAssessmentUrl(selection)
    if (!url) {
      wx.showToast({ title: '该版本暂不可用', icon: 'none' })
      return
    }

    wx.navigateTo({ url })
  }
})
