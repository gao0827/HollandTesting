const {
  USER_TYPES,
  ASSESSMENT_TYPES
} = require('../../config/product')
const {
  normalizeUserType,
  normalizeAssessmentType,
  parseAssessmentSelection,
  buildAssessmentUrl
} = require('../../services/assessment-selection')

const USER_OPTIONS = Object.freeze([
  Object.freeze({
    value: USER_TYPES.STUDENT,
    emblem: '学',
    title: '学生',
    description: '探索专业、学习方向与未来职业可能性'
  }),
  Object.freeze({
    value: USER_TYPES.WORKING_PROFESSIONAL,
    emblem: '职',
    title: '职场人士',
    description: '梳理优势偏好、岗位方向与发展路径'
  })
])

Page({
  data: {
    userType: '',
    assessmentType: ASSESSMENT_TYPES.STANDARD,
    userOptions: [],
    selectedVersionEmblem: '标',
    selectedVersionLabel: '标准版',
    selectedVersionCount: 60,
    selectedVersionStatus: '已开放',
    canContinue: false,
    actionText: '请选择你的身份',
    selectionSummary: '选择将用于生成对应的结果说明与行动建议'
  },

  onLoad(options = {}) {
    this.updateSelection(
      normalizeUserType(options.userType),
      normalizeAssessmentType(options.assessmentType)
    )
  },

  selectUserType(event) {
    this.updateSelection(
      normalizeUserType(event.currentTarget.dataset.value),
      this.data.assessmentType
    )
  },

  updateSelection(userType, assessmentType) {
    const selection = parseAssessmentSelection({ userType, assessmentType })
    const isProfessional = assessmentType === ASSESSMENT_TYPES.PROFESSIONAL
    const canContinue = selection.isUserTypeValid

    this.setData({
      userType,
      assessmentType,
      userOptions: USER_OPTIONS.map((item) => Object.assign({}, item, {
        selected: item.value === userType
      })),
      selectedVersionEmblem: isProfessional ? '专' : '标',
      selectedVersionLabel: isProfessional ? '专业版' : '标准版',
      selectedVersionCount: isProfessional ? 250 : 60,
      selectedVersionStatus: isProfessional ? '筹备中' : '已开放',
      canContinue,
      actionText: !canContinue
        ? '请选择你的身份'
        : (isProfessional ? '查看专业版规划' : '开始标准版测评'),
      selectionSummary: isProfessional
        ? '专业版尚未开放，不会产生支付、订单或解锁结果'
        : `${selection.userTypeLabel} · 标准版 60 题 · 本地保存进度`
    })
  },

  continueAssessment() {
    const selection = parseAssessmentSelection(this.data)

    if (!selection.isUserTypeValid) {
      wx.showToast({ title: '请先选择学生或职场人士', icon: 'none' })
      return
    }

    if (selection.assessmentType === ASSESSMENT_TYPES.PROFESSIONAL) {
      wx.showModal({
        title: '专业版正在筹备中',
        content: '专业版计划为 250 题，将分别探索职业兴趣、能力、职业价值观、环境偏好和职业愿望。目前题库与报告尚未完成，不复制 SDS® 等受版权保护内容，也不会产生支付或解锁结果。',
        showCancel: false,
        confirmText: '我知道了'
      })
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
