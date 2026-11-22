const { USER_TYPES } = require('../config/product')
const { DIMENSION_ORDER } = require('../data/riasec')
const professional = require('../data/questionnaire-professional')

function normalizeProfessionalSummary(summary) {
  const definition = [professional, professional.legacy].find(({ questionnaire }) =>
    questionnaire.questionnaire_version === summary?.questionnaireVersion &&
    questionnaire.scoring_version === summary.scoringVersion
  )
  if (!definition) return null
  if (summary.userType != null && !Object.values(USER_TYPES).includes(summary.userType)) return null

  const { items_per_dimension: itemCount, response_scale: scale } = definition.questionnaire
  const minScore = itemCount * scale.min
  const maxScore = itemCount * scale.max
  const scoreMap = summary.interestScores
  if (!DIMENSION_ORDER.every((code) => Number.isInteger(scoreMap?.[code]) && scoreMap[code] >= minScore && scoreMap[code] <= maxScore)) {
    return null
  }
  const dimensions = DIMENSION_ORDER.map((code) => ({
    code,
    rawScore: scoreMap[code],
    percentage: Math.round((scoreMap[code] - minScore) / (maxScore - minScore) * 100)
  }))

  const professionalScores = {}
  for (const section of definition.sections.slice(1)) {
    const submitted = summary.professionalScores?.[section.id]
    if (!Array.isArray(submitted) || submitted.length !== 5) return null
    const groups = new Map()
    for (const question of definition.questions) {
      if (question.section !== section.id) continue
      const group = groups.get(question.group) || { id: question.group, name: question.groupLabel, total: 0 }
      group.total += 1
      groups.set(group.id, group)
    }
    const input = new Map(submitted.map((group) => [group?.id, group]))
    professionalScores[section.id] = []
    for (const group of groups.values()) {
      const { answered, percentage } = input.get(group.id) || {}
      if (!Number.isInteger(answered) || answered < 0 || answered > group.total) return null
      if (section.id !== 'ability' && answered !== group.total) return null
      const rated = answered >= (section.minimumRatedPerGroup || 1)
      const validScore = rated ? Number.isInteger(percentage) && percentage >= 0 && percentage <= 100 : percentage === null
      if (!validScore) return null
      professionalScores[section.id].push({ ...group, answered, percentage })
    }
  }
  return {
    user_type: summary.userType,
    questionnaire_version: summary.questionnaireVersion,
    riasec_scores: Object.fromEntries(dimensions.map(({ code, rawScore }) => [code, rawScore])),
    dimensions,
    professional_scores: professionalScores
  }
}

function buildProfessionalSummary(record) {
  if (!record) return null
  const summary = {
    userType: record.user_type,
    questionnaireVersion: record.questionnaire_version,
    scoringVersion: record.scoring_version,
    interestScores: record.riasec_scores,
    professionalScores: record.professional_scores
  }
  return normalizeProfessionalSummary(summary) ? summary : null
}

module.exports = { buildProfessionalSummary, normalizeProfessionalSummary }
