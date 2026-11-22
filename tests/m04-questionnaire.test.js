const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const questions = require(path.join(ROOT, 'data/questions'))
const questionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))
const {
  REQUIRED_ITEM_FIELDS,
  REQUIRED_SOURCE_FIELDS,
  validateQuestionnaire
} = require(path.join(ROOT, 'models/questionnaire-validator'))

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('M04 标准版题库通过完整结构校验', () => {
  const validation = validateQuestionnaire(questionnaire, questions)
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  assert.equal(validation.stats.itemCount, 60)
  assert.equal(validation.stats.reverseItemCount, 0)
  assert.deepEqual(validation.stats.dimensionCounts, {
    R: 10,
    I: 10,
    A: 10,
    S: 10,
    E: 10,
    C: 10
  })
})

test('每道题都包含 ID、版本、维度、选项、计分、反向标记和来源', () => {
  questions.forEach((question, index) => {
    REQUIRED_ITEM_FIELDS.forEach((field) => {
      assert.equal(Object.prototype.hasOwnProperty.call(question, field), true, `${question.id}.${field}`)
    })
    REQUIRED_SOURCE_FIELDS.forEach((field) => {
      assert.equal(Object.prototype.hasOwnProperty.call(question.source, field), true, `${question.id}.source.${field}`)
    })
    assert.equal(question.order, index + 1)
    assert.equal(question.questionnaire_id, questionnaire.questionnaire_id)
    assert.equal(question.questionnaire_version, questionnaire.questionnaire_version)
    assert.equal(question.schema_version, questionnaire.question_schema_version)
    assert.equal(question.options.length, 5)
    assert.deepEqual(question.options.map((item) => item.value), [1, 2, 3, 4, 5])
    assert.equal(question.reverse_scored, false)
    assert.equal(question.scoring.direction, 'forward')
  })
})

test('题库明确为项目自编原型，不冒充官方量表', () => {
  assert.equal(questionnaire.content_status, 'self_authored_prototype')
  assert.equal(questionnaire.validation_status, 'not_formally_validated')
  assert.equal(questionnaire.official_instrument, false)
  assert.equal(questionnaire.item_source.origin, 'self_authored')
  assert.equal(questionnaire.item_source.authorization_status, 'original_project_content')
  assert.equal(questionnaire.item_source.official_instrument, false)
  assert.match(questionnaire.notice, /不是 O\*NET®、SDS® 或其他官方量表/)
})

test('问卷元数据和共享选项不可被运行时修改', () => {
  assert.equal(Object.isFrozen(questionnaire), true)
  assert.equal(Object.isFrozen(questionnaire.response_options), true)
  assert.equal(Object.isFrozen(questionnaire.response_options[0]), true)
  assert.equal(Object.isFrozen(questionnaire.item_source), true)
  assert.equal(Object.isFrozen(questions), true)
  assert.equal(Object.isFrozen(questions[0]), true)
})

test('题库结构支持经审核后加入反向题', () => {
  const reverseQuestion = Object.assign({}, questions[0], {
    reverse_scored: true,
    scoring: {
      rule: questionnaire.scoring_rules.reverse.rule,
      direction: 'reverse',
      score_map: questionnaire.scoring_rules.reverse.score_map
    }
  })
  const items = questions.slice()
  items[0] = reverseQuestion
  const metadata = Object.assign({}, questionnaire, { reverse_item_count: 1 })
  const validation = validateQuestionnaire(metadata, items)

  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  assert.equal(validation.stats.reverseItemCount, 1)
  assert.deepEqual(reverseQuestion.scoring.score_map, { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 })
})

test('校验器能识别版本、维度、来源和计分错误', () => {
  const brokenQuestion = Object.assign({}, questions[0], {
    questionnaire_version: 'wrong-version',
    dimension: 'X',
    scoring: Object.assign({}, questions[0].scoring, { direction: 'reverse' }),
    source: null
  })
  const items = questions.slice()
  items[0] = brokenQuestion
  const validation = validateQuestionnaire(questionnaire, items)
  const codes = validation.errors.map((error) => error.code)

  assert.equal(validation.valid, false)
  assert.equal(codes.includes('QUESTIONNAIRE_VERSION_MISMATCH'), true)
  assert.equal(codes.includes('INVALID_DIMENSION'), true)
  assert.equal(codes.includes('SCORING_DIRECTION_MISMATCH'), true)
  assert.equal(codes.includes('INVALID_SOURCE'), true)
})

test('答题页统一使用题库元数据中的五级选项', () => {
  const assessmentScript = read('pages/assessment/assessment.js')
  assert.match(assessmentScript, /standardQuestionnaire\.response_options\.map/)
  ;['完全不喜欢', '不太喜欢', '不确定', '比较喜欢', '非常喜欢'].forEach((label) => {
    assert.match(read('data/questionnaire-standard.js'), new RegExp(label))
  })
})

test('测评说明披露自编来源，说明页入口回到 M03 选择流程', () => {
  const aboutWxml = read('pages/about/about.wxml')
  const aboutScript = read('pages/about/about.js')
  assert.match(aboutWxml, /题目来源/)
  assert.match(aboutWxml, /尚未完成正式心理测量学验证/)
  assert.match(aboutWxml, /不是 O\*NET®、SDS® 或其他官方量表/)
  assert.match(aboutScript, /pages\/selection\/selection\?assessmentType=standard/)
  assert.doesNotMatch(aboutScript, /pages\/assessment\/assessment/)
})
