const { COMPLETION_STATUS } = require('../config/product')
const { DIMENSION_ORDER, RIASEC } = require('../data/riasec')

function toAnswerList(answers) {
  return Object.keys(answers || {})
    .sort((left, right) => Number(left.replace(/\D/g, '')) - Number(right.replace(/\D/g, '')))
    .map((questionId) => ({
      question_id: questionId,
      selected_value: Number(answers[questionId])
    }))
}

function createCompletedAssessmentRecord({
  questionnaire,
  selection,
  answers,
  result,
  completedAt
}) {
  const assessmentId = String(completedAt)
  const topCodes = result.topDimensions.slice(0, 3).map((item) => item.code)

  return {
    questionnaire_id: questionnaire.questionnaire_id,
    questionnaire_version: questionnaire.questionnaire_version,
    scoring_version: questionnaire.scoring_version,
    assessment_id: assessmentId,
    user_type: selection.userType,
    assessment_type: selection.assessmentType,
    answers: toAnswerList(answers),
    riasec_scores: Object.assign({}, result.rawScores),
    ...(result.professionalScores ? { professional_scores: result.professionalScores } : {}),
    top_codes: topCodes,
    completion_status: COMPLETION_STATUS.COMPLETED,
    created_at: completedAt,

    // 兼容当前结果页和历史页，后续模块完成迁移后再移除旧字段。
    id: assessmentId,
    completedAt,
    questionCount: questionnaire.item_count,
    version: questionnaire.questionnaire_version,
    code: result.code,
    primaryCode: topCodes[0],
    rawScores: Object.assign({}, result.rawScores),
    dimensions: result.dimensions,
    boundaryTie: result.boundaryTie,
    tieGroups: result.tieGroups || []
  }
}

function normalizeStoredRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const storedId = record.assessment_id || record.id
  if (typeof storedId !== 'string' && !Number.isFinite(storedId)) return null
  const id = String(storedId)
  if (!id) return null

  const saved = Array.isArray(record.dimensions) ? record.dimensions : []
  const scores = {}
  const dimensions = DIMENSION_ORDER.flatMap((code, order) => {
    const dimension = saved.find((item) => item && item.code === code)
    const rawScore = [record.riasec_scores?.[code], record.rawScores?.[code], dimension?.rawScore].find(Number.isFinite)
    if (!Number.isFinite(rawScore)) return []
    scores[code] = rawScore
    const usablePercentage = dimension?.rawScore === rawScore &&
      Number.isFinite(dimension.percentage) && dimension.percentage >= 0 && dimension.percentage <= 100
    return [{
      ...dimension,
      code,
      order,
      name: RIASEC[code].name,
      rawScore,
      percentage: usablePercentage ? dimension.percentage : null
    }]
  })
  const storedCodes = Array.isArray(record.top_codes) ? record.top_codes : String(record.code || '').split('')
  const ranking = dimensions.slice().sort((a, b) => b.rawScore - a.rawScore || a.order - b.order)
  const topCodes = [...new Set(storedCodes.filter((code) => DIMENSION_ORDER.includes(code)))].slice(0, 3)
  if (!topCodes.length) topCodes.push(...ranking.slice(0, 3).map((item) => item.code))
  if (!topCodes.length && DIMENSION_ORDER.includes(record.primaryCode)) topCodes.push(record.primaryCode)
  if (!topCodes.length) return null

  const completedAt = record.created_at ?? record.completedAt
  return {
    ...record,
    assessment_id: id,
    questionnaire_id: record.questionnaire_id ?? null,
    questionnaire_version: record.questionnaire_version ?? record.version ?? null,
    scoring_version: record.scoring_version ?? null,
    user_type: record.user_type ?? record.userType ?? null,
    assessment_type: record.assessment_type ?? record.assessmentType ?? null,
    answers: record.answers && typeof record.answers === 'object' && !Array.isArray(record.answers)
      ? toAnswerList(record.answers)
      : (record.answers ?? null),
    riasec_scores: scores,
    top_codes: topCodes,
    completion_status: record.completion_status ?? COMPLETION_STATUS.COMPLETED,
    created_at: completedAt ?? null,
    id,
    completedAt: completedAt ?? null,
    code: topCodes.join(''),
    primaryCode: topCodes[0],
    rawScores: scores,
    dimensions
  }
}

module.exports = {
  toAnswerList,
  createCompletedAssessmentRecord,
  normalizeStoredRecord
}
