const USER_TYPES = Object.freeze({
  STUDENT: 'student',
  CAREER_STARTER: 'career_starter',
  CAREER_TRANSITION: 'career_transition',
  CAREER_ADVISOR: 'career_advisor',
  // 已保存的职场人士记录和草稿沿用原角色标识。
  WORKING_PROFESSIONAL: 'working_professional'
})

const ASSESSMENT_TYPES = Object.freeze({
  STANDARD: 'standard',
  PROFESSIONAL: 'professional'
})

const COMPLETION_STATUS = Object.freeze({
  DRAFT: 'draft',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned'
})

const FEATURE_FLAGS = Object.freeze({
  standardAssessment: true,
  professionalAssessment: true,
  deepReport: true,
  knowledgeBase: true,
  advertising: false,
  payments: false,
  paidReportUnlock: false
})

const PRODUCT_CONFIG = Object.freeze({
  productName: '职趣测评',
  dataSchemaVersion: '1.0.0',
  maxLocalHistory: 30,
  userTypes: USER_TYPES,
  assessmentTypes: ASSESSMENT_TYPES,
  completionStatus: COMPLETION_STATUS,
  featureFlags: FEATURE_FLAGS
})

module.exports = {
  USER_TYPES,
  ASSESSMENT_TYPES,
  COMPLETION_STATUS,
  FEATURE_FLAGS,
  PRODUCT_CONFIG
}
