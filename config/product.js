const USER_TYPES = Object.freeze({
  STUDENT: 'student',
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
  professionalAssessment: false,
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
