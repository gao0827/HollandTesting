const {
  USER_TYPES,
  ASSESSMENT_TYPES,
  FEATURE_FLAGS
} = require('../config/product')

const ASSESSMENT_ROLE_OPTIONS = Object.freeze([
  { value: USER_TYPES.STUDENT, emblem: '学', title: '高中生、大学生', description: '专业选择、职业探索' },
  { value: USER_TYPES.CAREER_STARTER, emblem: '职', title: '职场新人', description: '了解职业偏好、岗位方向' },
  { value: USER_TYPES.CAREER_TRANSITION, emblem: '转', title: '职场转型人群', description: '重新探索工作方向' },
  { value: USER_TYPES.CAREER_ADVISOR, emblem: '辅', title: '家长、职业辅导者', description: '辅助讨论专业与职业选择' }
].map(Object.freeze))

const USER_TYPE_LABELS = Object.freeze({
  ...Object.fromEntries(ASSESSMENT_ROLE_OPTIONS.map(({ value, title }) => [value, title])),
  [USER_TYPES.WORKING_PROFESSIONAL]: '职场人士'
})

const ASSESSMENT_TYPE_LABELS = Object.freeze({
  [ASSESSMENT_TYPES.STANDARD]: '标准版',
  [ASSESSMENT_TYPES.PROFESSIONAL]: '专业版'
})

function normalizeUserType(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(USER_TYPE_LABELS, value) ? value : ''
}

function normalizeAssessmentType(value) {
  return Object.prototype.hasOwnProperty.call(ASSESSMENT_TYPE_LABELS, value)
    ? value
    : ASSESSMENT_TYPES.STANDARD
}

function parseAssessmentSelection(input) {
  const source = input && typeof input === 'object' ? input : {}
  const userType = normalizeUserType(source.userType || source.user_type)
  const assessmentType = normalizeAssessmentType(source.assessmentType || source.assessment_type)

  return {
    userType,
    userTypeLabel: USER_TYPE_LABELS[userType] || '',
    assessmentType,
    assessmentTypeLabel: ASSESSMENT_TYPE_LABELS[assessmentType],
    isUserTypeValid: Boolean(userType),
    isAssessmentAvailable: assessmentType === ASSESSMENT_TYPES.STANDARD
      ? FEATURE_FLAGS.standardAssessment
      : FEATURE_FLAGS.professionalAssessment
  }
}

function canStartAssessment(selection) {
  return Boolean(
    selection &&
    selection.isUserTypeValid &&
    selection.isAssessmentAvailable
  )
}

function buildAssessmentUrl(selection) {
  if (!canStartAssessment(selection)) return ''
  return `/pages/assessment/assessment?userType=${selection.userType}&assessmentType=${selection.assessmentType}`
}

module.exports = {
  ASSESSMENT_ROLE_OPTIONS,
  USER_TYPE_LABELS,
  ASSESSMENT_TYPE_LABELS,
  normalizeUserType,
  normalizeAssessmentType,
  parseAssessmentSelection,
  canStartAssessment,
  buildAssessmentUrl
}
