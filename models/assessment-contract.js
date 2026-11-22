const REQUIRED_ASSESSMENT_FIELDS = Object.freeze([
  'questionnaire_id',
  'questionnaire_version',
  'scoring_version',
  'assessment_id',
  'user_type',
  'assessment_type',
  'answers',
  'riasec_scores',
  'top_codes',
  'completion_status',
  'created_at'
])

const PROFESSIONAL_SECTION_KEYS = Object.freeze([
  'ability',
  'career_values',
  'environment_preferences',
  'career_aspirations'
])

const ASSESSMENT_RECORD_CONTRACT = Object.freeze({
  version: '1.0.0',
  requiredFields: REQUIRED_ASSESSMENT_FIELDS,
  answerShape: Object.freeze([
    'question_id',
    'selected_value'
  ]),
  riasecScoreKeys: Object.freeze(['R', 'I', 'A', 'S', 'E', 'C']),
  professionalSectionKeys: PROFESSIONAL_SECTION_KEYS,
  timestampUnit: 'milliseconds'
})

function getMissingAssessmentFields(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return REQUIRED_ASSESSMENT_FIELDS.slice()
  }

  return REQUIRED_ASSESSMENT_FIELDS.filter((field) => (
    !Object.prototype.hasOwnProperty.call(record, field) ||
    record[field] === null ||
    record[field] === undefined
  ))
}

function hasCompleteAssessmentContract(record) {
  return getMissingAssessmentFields(record).length === 0
}

module.exports = {
  REQUIRED_ASSESSMENT_FIELDS,
  PROFESSIONAL_SECTION_KEYS,
  ASSESSMENT_RECORD_CONTRACT,
  getMissingAssessmentFields,
  hasCompleteAssessmentContract
}
