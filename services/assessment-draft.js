function getValidQuestionIds(questions) {
  return new Set((questions || []).map((question) => question.id))
}

function getValidResponseValues(questionnaire) {
  return new Set((questionnaire.response_options || []).map((option) => Number(option.value)))
}

function normalizeAnswers(questions, answers, questionnaire) {
  const source = answers && typeof answers === 'object' && !Array.isArray(answers)
    ? answers
    : {}
  const validQuestionIds = getValidQuestionIds(questions)
  const validResponseValues = getValidResponseValues(questionnaire)
  const optionsById = new Map((questions || []).map((item) => [item.id, item.options]))
  const normalized = {}

  Object.keys(source).forEach((questionId) => {
    const value = Number(source[questionId])
    const options = optionsById.get(questionId)
    const valid = options ? options.some((option) => Number(option.value) === value) : validResponseValues.has(value)
    if (validQuestionIds.has(questionId) && valid) {
      normalized[questionId] = value
    }
  })

  return normalized
}

function countAnswered(questions, answers, questionnaire) {
  return Object.keys(normalizeAnswers(questions, answers, questionnaire)).length
}

function getResumeIndex(draft, questions) {
  const maxIndex = Math.max(0, (questions || []).length - 1)
  const value = Number(draft && draft.currentIndex)
  if (!Number.isInteger(value)) return 0
  return Math.min(maxIndex, Math.max(0, value))
}

function getDraftCompatibility(draft, questionnaire, selection) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return 'empty'
  if (!draft.answers || typeof draft.answers !== 'object' || !Object.keys(draft.answers).length) {
    return 'empty'
  }

  if (draft.questionnaire_id && draft.questionnaire_id !== questionnaire.questionnaire_id) {
    return 'questionnaire_mismatch'
  }
  if (draft.questionnaire_version && draft.questionnaire_version !== questionnaire.questionnaire_version) {
    return 'version_mismatch'
  }
  if (draft.schema_version && draft.schema_version !== questionnaire.question_schema_version) {
    return 'schema_mismatch'
  }

  if (!draft.user_type || !draft.assessment_type) return 'legacy'
  if (
    draft.user_type !== selection.userType ||
    draft.assessment_type !== selection.assessmentType
  ) {
    return 'selection_mismatch'
  }

  return 'compatible'
}

function createDraftSnapshot({
  questionnaire,
  selection,
  questions,
  answers,
  currentIndex,
  updatedAt
}) {
  return {
    questionnaire_id: questionnaire.questionnaire_id,
    questionnaire_version: questionnaire.questionnaire_version,
    schema_version: questionnaire.question_schema_version,
    scoring_version: questionnaire.scoring_version,
    user_type: selection.userType,
    assessment_type: selection.assessmentType,
    answers: normalizeAnswers(questions, answers, questionnaire),
    currentIndex: getResumeIndex({ currentIndex }, questions),
    updatedAt
  }
}

module.exports = {
  normalizeAnswers,
  countAnswered,
  getResumeIndex,
  getDraftCompatibility,
  createDraftSnapshot
}
