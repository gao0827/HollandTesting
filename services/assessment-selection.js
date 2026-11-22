const {
  USER_TYPES,
  ASSESSMENT_TYPES,
  FEATURE_FLAGS
} = require('../config/product')

const USER_TYPE_LABELS = Object.freeze({
  [USER_TYPES.STUDENT]: '学生',
  [USER_TYPES.WORKING_PROFESSIONAL]: '职场人士'
})

const ASSESSMENT_TYPE_LABELS = Object.freeze({
  [ASSESSMENT_TYPES.STANDARD]: '标准版',
  [ASSESSMENT_TYPES.PROFESSIONAL]: '专业版'
})

function normalizeUserType(value) {
  return Object.prototype.hasOwnProperty.call(USER_TYPE_LABELS, value) ? value : ''
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
    selection.assessmentType === ASSESSMENT_TYPES.STANDARD &&
    selection.isAssessmentAvailable
  )
}

function buildAssessmentUrl(selection) {
  if (!canStartAssessment(selection)) return ''
  return `/pages/assessment/assessment?userType=${selection.userType}&assessmentType=${selection.assessmentType}`
}

module.exports = {
  USER_TYPE_LABELS,
  ASSESSMENT_TYPE_LABELS,
  normalizeUserType,
  normalizeAssessmentType,
  parseAssessmentSelection,
  canStartAssessment,
  buildAssessmentUrl
}
