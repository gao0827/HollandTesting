const { DIMENSION_ORDER, RIASEC } = require('../data/riasec')
const standardQuestionnaire = require('../data/questionnaire-standard')

const SCORING_RULES = Object.freeze({
  [standardQuestionnaire.scoring_version]: Object.freeze({
    version: standardQuestionnaire.scoring_version,
    method: 'dimension_sum',
    normalization: 'observed_range_percentage',
    tie_break_order: Object.freeze(DIMENSION_ORDER.slice())
  })
})

class ScoringValidationError extends Error {
  constructor(validation) {
    super('测评答案不完整或包含非法选项，不能生成评分结果')
    this.name = 'ScoringValidationError'
    this.code = 'INVALID_ASSESSMENT_ANSWERS'
    this.validation = validation
  }
}

function getScoringRule(version = standardQuestionnaire.scoring_version) {
  const rule = SCORING_RULES[version]
  if (!rule) {
    const error = new Error(`不支持的评分规则版本：${version}`)
    error.name = 'UnsupportedScoringVersionError'
    error.code = 'UNSUPPORTED_SCORING_VERSION'
    throw error
  }
  return rule
}

function scoreAnswer(question, answer) {
  const value = Number(answer)
  const optionValues = new Set((question.options || []).map((option) => Number(option.value)))
  const scoreMap = question.scoring && question.scoring.score_map

  if (!Number.isFinite(value) || !optionValues.has(value) || !scoreMap) {
    return { valid: false, value, score: 0 }
  }
  if (!Object.prototype.hasOwnProperty.call(scoreMap, value)) {
    return { valid: false, value, score: 0 }
  }

  const score = Number(scoreMap[value])
  if (!Number.isFinite(score)) return { valid: false, value, score: 0 }
  return { valid: true, value, score }
}

function validateAnswers(questions, answers) {
  const source = answers && typeof answers === 'object' && !Array.isArray(answers)
    ? answers
    : {}
  const questionIds = new Set((questions || []).map((question) => question.id))
  const missingQuestionIds = []
  const invalidAnswers = []
  let answeredCount = 0

  ;(questions || []).forEach((question) => {
    if (!Object.prototype.hasOwnProperty.call(source, question.id)) {
      missingQuestionIds.push(question.id)
      return
    }

    const scored = scoreAnswer(question, source[question.id])
    if (!scored.valid) {
      invalidAnswers.push({
        question_id: question.id,
        selected_value: source[question.id]
      })
      return
    }
    answeredCount += 1
  })

  const unknownAnswerIds = Object.keys(source).filter((questionId) => !questionIds.has(questionId))
  return {
    valid: missingQuestionIds.length === 0 && invalidAnswers.length === 0,
    expectedCount: (questions || []).length,
    answeredCount,
    missingQuestionIds,
    invalidAnswers,
    unknownAnswerIds
  }
}

function getMissingQuestionIds(questions, answers) {
  return validateAnswers(questions, answers).missingQuestionIds
}

function buildTieGroups(ranking) {
  const groups = new Map()
  ranking.forEach((item, index) => {
    const entry = groups.get(item.rawScore) || []
    entry.push({ code: item.code, position: index + 1 })
    groups.set(item.rawScore, entry)
  })

  return Array.from(groups.entries())
    .filter(([, entries]) => entries.length > 1)
    .sort((left, right) => right[0] - left[0])
    .map(([score, entries]) => {
      const positions = entries.map((entry) => entry.position)
      return {
        score,
        codes: entries.map((entry) => entry.code),
        firstPosition: Math.min(...positions),
        lastPosition: Math.max(...positions),
        crossesTopThreeBoundary: Math.min(...positions) <= 3 && Math.max(...positions) >= 4
      }
    })
}

function calculateResult(questions, answers, options = {}) {
  const scoringVersion = options.scoringVersion || standardQuestionnaire.scoring_version
  const rule = getScoringRule(scoringVersion)
  const validation = validateAnswers(questions, answers)
  if (!validation.valid) throw new ScoringValidationError(validation)

  const rawScores = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, 0]))
  const itemCounts = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, 0]))
  const minScores = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, 0]))
  const maxScores = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, 0]))

  questions.forEach((question) => {
    if (!Object.prototype.hasOwnProperty.call(rawScores, question.dimension)) return
    const scored = scoreAnswer(question, answers[question.id])
    const possibleScores = Object.values(question.scoring.score_map).map(Number)
    rawScores[question.dimension] += scored.score
    itemCounts[question.dimension] += 1
    minScores[question.dimension] += Math.min(...possibleScores)
    maxScores[question.dimension] += Math.max(...possibleScores)
  })

  const baseDimensions = DIMENSION_ORDER.map((code, order) => {
    const range = maxScores[code] - minScores[code]
    const percentage = range > 0
      ? Math.round(((rawScores[code] - minScores[code]) / range) * 100)
      : 0

    return {
      code,
      order,
      name: RIASEC[code].name,
      rawScore: rawScores[code],
      itemCount: itemCounts[code],
      minScore: minScores[code],
      maxScore: maxScores[code],
      percentage: Math.min(100, Math.max(0, percentage))
    }
  })

  const sorted = baseDimensions.slice().sort((left, right) => {
    if (right.rawScore !== left.rawScore) return right.rawScore - left.rawScore
    return left.order - right.order
  })

  let previousScore = null
  let previousRank = 0
  const ranking = sorted.map((item, index) => {
    const rank = item.rawScore === previousScore ? previousRank : index + 1
    previousScore = item.rawScore
    previousRank = rank
    return Object.assign({}, item, { rank })
  })
  const rankByCode = Object.fromEntries(ranking.map((item) => [item.code, item.rank]))
  const dimensions = baseDimensions.map((item) => Object.assign({}, item, {
    rank: rankByCode[item.code]
  }))
  const topDimensions = ranking.slice(0, 3)
  const boundaryTie = ranking.length > 3 && ranking[2].rawScore === ranking[3].rawScore
  const tieGroups = buildTieGroups(ranking)

  return {
    scoringVersion,
    scoringRule: rule.method,
    validation,
    rawScores,
    dimensions,
    ranking,
    topDimensions,
    topCodes: topDimensions.map((item) => item.code),
    code: topDimensions.map((item) => item.code).join(''),
    boundaryTie,
    tieGroups
  }
}

function isComplete(questions, answers) {
  return validateAnswers(questions, answers).valid
}

module.exports = {
  SCORING_RULES,
  ScoringValidationError,
  getScoringRule,
  scoreAnswer,
  validateAnswers,
  getMissingQuestionIds,
  calculateResult,
  isComplete
}
