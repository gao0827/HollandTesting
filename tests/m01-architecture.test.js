const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const appConfig = require(path.join(ROOT, 'app.json'))
const questions = require(path.join(ROOT, 'data/questions'))
const standardQuestionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))
const { calculateResult, isComplete } = require(path.join(ROOT, 'utils/scoring'))
const { FEATURE_FLAGS, PRODUCT_CONFIG } = require(path.join(ROOT, 'config/product'))
const {
  REQUIRED_ASSESSMENT_FIELDS,
  PROFESSIONAL_SECTION_KEYS,
  getMissingAssessmentFields,
  hasCompleteAssessmentContract
} = require(path.join(ROOT, 'models/assessment-contract'))

test('保留审计时的 AppID，不在 M01 中擅自修改', () => {
  const projectConfig = require(path.join(ROOT, 'project.config.json'))
  assert.equal(projectConfig.appid, 'touristappid')
})

test('M01 规划目录存在', () => {
  const directories = ['assets', 'components', 'config', 'data', 'docs', 'models', 'pages', 'services', 'tests', 'utils']
  directories.forEach((directory) => {
    assert.equal(fs.statSync(path.join(ROOT, directory)).isDirectory(), true, directory)
  })
})

test('所有已注册页面均具备原生小程序四件套', () => {
  appConfig.pages.forEach((page) => {
    ['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
      assert.equal(fs.existsSync(path.join(ROOT, `${page}${extension}`)), true, `${page}${extension}`)
    })
  })
})

test('商业化和未完成能力默认关闭', () => {
  assert.equal(FEATURE_FLAGS.standardAssessment, true)
  assert.equal(FEATURE_FLAGS.professionalAssessment, false)
  assert.equal(FEATURE_FLAGS.advertising, false)
  assert.equal(FEATURE_FLAGS.payments, false)
  assert.equal(PRODUCT_CONFIG.dataSchemaVersion, '1.0.0')
})

test('测评记录契约包含任务书要求的全部字段', () => {
  assert.deepEqual(REQUIRED_ASSESSMENT_FIELDS, [
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
  assert.deepEqual(PROFESSIONAL_SECTION_KEYS, [
    'ability',
    'career_values',
    'environment_preferences',
    'career_aspirations'
  ])
  assert.deepEqual(getMissingAssessmentFields({}), REQUIRED_ASSESSMENT_FIELDS)
})

test('完整契约和缺失字段检查行为稳定', () => {
  const record = Object.fromEntries(REQUIRED_ASSESSMENT_FIELDS.map((field) => [field, field === 'answers' ? [] : 'test']))
  assert.equal(hasCompleteAssessmentContract(record), true)
  delete record.scoring_version
  assert.equal(hasCompleteAssessmentContract(record), false)
  assert.deepEqual(getMissingAssessmentFields(record), ['scoring_version'])
})

test('标准版原型题库保持 60 题且六维均衡', () => {
  const ids = new Set(questions.map((question) => question.id))
  const counts = questions.reduce((result, question) => {
    result[question.dimension] = (result[question.dimension] || 0) + 1
    return result
  }, {})

  assert.equal(questions.length, 60)
  assert.equal(ids.size, 60)
  assert.deepEqual(counts, { R: 10, I: 10, A: 10, S: 10, E: 10, C: 10 })
  assert.equal(standardQuestionnaire.item_count, 60)
  assert.equal(standardQuestionnaire.items_per_dimension, 10)
  assert.equal(standardQuestionnaire.official_instrument, false)
  assert.equal(standardQuestionnaire.validation_status, 'not_formally_validated')
})

test('现有基础评分作为 M01 回归基线保持可用', () => {
  const values = { R: 5, I: 4, A: 3, S: 2, E: 1, C: 1 }
  const answers = Object.fromEntries(questions.map((question) => [question.id, values[question.dimension]]))
  const result = calculateResult(questions, answers)

  assert.equal(isComplete(questions, answers), true)
  assert.equal(result.code, 'RIA')
  assert.deepEqual(result.rawScores, { R: 50, I: 40, A: 30, S: 20, E: 10, C: 10 })
})
