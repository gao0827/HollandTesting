const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const questions = require(path.join(ROOT, 'data/questions'))
const questionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))
const {
  SCORING_RULES,
  ScoringValidationError,
  getScoringRule,
  scoreAnswer,
  validateAnswers,
  getMissingQuestionIds,
  calculateResult,
  isComplete
} = require(path.join(ROOT, 'services/riasec-scoring'))

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function createAnswersByDimension(values) {
  return Object.fromEntries(questions.map((question) => [question.id, values[question.dimension]]))
}

test('M06 按已登记的评分规则版本计算标准版结果', () => {
  const answers = createAnswersByDimension({ R: 5, I: 4, A: 3, S: 2, E: 1, C: 1 })
  const result = calculateResult(questions, answers, {
    scoringVersion: questionnaire.scoring_version
  })

  assert.equal(result.scoringVersion, questionnaire.scoring_version)
  assert.equal(result.scoringRule, 'dimension_sum')
  assert.deepEqual(result.rawScores, { R: 50, I: 40, A: 30, S: 20, E: 10, C: 10 })
  assert.deepEqual(result.topCodes, ['R', 'I', 'A'])
  assert.equal(result.code, 'RIA')
  assert.equal(result.boundaryTie, false)
  assert.equal(SCORING_RULES[questionnaire.scoring_version].version, questionnaire.scoring_version)
})

test('评分引擎按题目分值映射执行反向计分', () => {
  const original = questions[0]
  const reverseQuestion = Object.assign({}, original, {
    reverse_scored: true,
    scoring: {
      rule: questionnaire.scoring_rules.reverse.rule,
      direction: 'reverse',
      score_map: questionnaire.scoring_rules.reverse.score_map
    }
  })

  assert.deepEqual(scoreAnswer(original, 1), { valid: true, value: 1, score: 1 })
  assert.deepEqual(scoreAnswer(reverseQuestion, 1), { valid: true, value: 1, score: 5 })
  assert.deepEqual(scoreAnswer(reverseQuestion, 5), { valid: true, value: 5, score: 1 })
})

test('缺题校验列出具体题号并阻止生成结果', () => {
  const answers = createAnswersByDimension({ R: 5, I: 4, A: 3, S: 2, E: 1, C: 1 })
  delete answers.q17
  delete answers.q60
  const validation = validateAnswers(questions, answers)

  assert.equal(validation.valid, false)
  assert.equal(validation.answeredCount, 58)
  assert.deepEqual(validation.missingQuestionIds, ['q17', 'q60'])
  assert.deepEqual(getMissingQuestionIds(questions, answers), ['q17', 'q60'])
  assert.equal(isComplete(questions, answers), false)
  assert.throws(
    () => calculateResult(questions, answers),
    (error) => error instanceof ScoringValidationError && error.validation.missingQuestionIds.length === 2
  )
})

test('非法选项不会被四舍五入或截断为有效答案', () => {
  const answers = createAnswersByDimension({ R: 5, I: 4, A: 3, S: 2, E: 1, C: 1 })
  answers.q01 = 6
  answers.q02 = 2.5
  const validation = validateAnswers(questions, answers)

  assert.equal(validation.valid, false)
  assert.deepEqual(validation.invalidAnswers, [
    { question_id: 'q01', selected_value: 6 },
    { question_id: 'q02', selected_value: 2.5 }
  ])
  assert.equal(scoreAnswer(questions[0], 6).valid, false)
})

test('并列维度保留固定展示顺序并明确标记前三边界并列', () => {
  const allTied = calculateResult(questions, createAnswersByDimension({
    R: 3,
    I: 3,
    A: 3,
    S: 3,
    E: 3,
    C: 3
  }))
  assert.equal(allTied.code, 'RIA')
  assert.deepEqual(allTied.ranking.map((item) => item.code), ['R', 'I', 'A', 'S', 'E', 'C'])
  assert.deepEqual(allTied.ranking.map((item) => item.rank), [1, 1, 1, 1, 1, 1])
  assert.equal(allTied.boundaryTie, true)
  assert.equal(allTied.tieGroups[0].crossesTopThreeBoundary, true)

  const boundaryTied = calculateResult(questions, createAnswersByDimension({
    R: 5,
    I: 4,
    A: 3,
    S: 3,
    E: 2,
    C: 1
  }))
  assert.equal(boundaryTied.code, 'RIA')
  assert.equal(boundaryTied.boundaryTie, true)
  assert.deepEqual(boundaryTied.tieGroups.find((group) => group.score === 30).codes, ['A', 'S'])
})

test('非边界并列不会误报前三边界风险', () => {
  const result = calculateResult(questions, createAnswersByDimension({
    R: 5,
    I: 5,
    A: 4,
    S: 3,
    E: 2,
    C: 1
  }))
  assert.equal(result.boundaryTie, false)
  assert.deepEqual(result.topCodes, ['R', 'I', 'A'])
  assert.equal(result.tieGroups[0].crossesTopThreeBoundary, false)
})

test('未登记的评分版本被拒绝，不能静默套用其他规则', () => {
  assert.throws(
    () => getScoringRule('unknown-version'),
    (error) => error.code === 'UNSUPPORTED_SCORING_VERSION'
  )
  assert.throws(
    () => calculateResult(questions, createAnswersByDimension({
      R: 5,
      I: 4,
      A: 3,
      S: 2,
      E: 1,
      C: 1
    }), { scoringVersion: 'unknown-version' }),
    (error) => error.code === 'UNSUPPORTED_SCORING_VERSION'
  )
})

test('答题提交显式传入评分版本，完成记录保留评分和并列信息', () => {
  const assessmentScript = read('pages/assessment/assessment.js')
  const recordModel = read('models/assessment-record.js')
  assert.match(assessmentScript, /scoringVersion:\s*standardQuestionnaire\.scoring_version/)
  assert.match(recordModel, /scoring_version:\s*questionnaire\.scoring_version/)
  assert.match(recordModel, /tieGroups:\s*result\.tieGroups/)
})
