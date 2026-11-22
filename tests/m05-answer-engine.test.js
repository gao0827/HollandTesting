const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const questions = require(path.join(ROOT, 'data/questions'))
const questionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))
const { USER_TYPES, ASSESSMENT_TYPES } = require(path.join(ROOT, 'config/product'))
const { parseAssessmentSelection } = require(path.join(ROOT, 'services/assessment-selection'))
const {
  normalizeAnswers,
  countAnswered,
  getResumeIndex,
  getDraftCompatibility,
  createDraftSnapshot
} = require(path.join(ROOT, 'services/assessment-draft'))

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function loadAssessmentPage(wxMock) {
  let definition = null
  global.Page = (value) => {
    definition = value
  }
  global.wx = wxMock
  const pagePath = path.join(ROOT, 'pages/assessment/assessment.js')
  delete require.cache[require.resolve(pagePath)]
  require(pagePath)
  return definition
}

function createPageInstance(definition) {
  return Object.assign({
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(nextData) {
      this.data = Object.assign({}, this.data, nextData)
    }
  }, definition)
}

function createSelection(userType = USER_TYPES.STUDENT) {
  return parseAssessmentSelection({
    userType,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })
}

test('M05 答题页包含逐题进度、自动保存、上一题和下一题', () => {
  const wxml = read('pages/assessment/assessment.wxml')
  assert.match(wxml, /currentNumber.*total/)
  assert.match(wxml, /progress-fill/)
  assert.match(wxml, /自动保存/)
  assert.match(wxml, /bindtap="selectAnswer"/)
  assert.match(wxml, /bindtap="goPrevious"/)
  assert.match(wxml, /bindtap="goNext"/)
  assert.match(wxml, /可随时返回上一题修改答案/)
})

test('草稿服务过滤未知题号和非法选项', () => {
  const normalized = normalizeAnswers(questions, {
    q01: 5,
    q02: '4',
    q03: 8,
    unknown: 3
  }, questionnaire)

  assert.deepEqual(normalized, { q01: 5, q02: 4 })
  assert.equal(countAnswered(questions, normalized, questionnaire), 2)
})

test('恢复题号始终限制在 60 题范围内', () => {
  assert.equal(getResumeIndex({ currentIndex: -5 }, questions), 0)
  assert.equal(getResumeIndex({ currentIndex: 12 }, questions), 12)
  assert.equal(getResumeIndex({ currentIndex: 999 }, questions), 59)
  assert.equal(getResumeIndex({ currentIndex: 'invalid' }, questions), 0)
})

test('草稿兼容检查区分身份、问卷版本和结构版本', () => {
  const selection = createSelection()
  const baseDraft = createDraftSnapshot({
    questionnaire,
    selection,
    questions,
    answers: { q01: 5 },
    currentIndex: 0,
    updatedAt: 1
  })

  assert.equal(getDraftCompatibility(baseDraft, questionnaire, selection), 'compatible')
  assert.equal(getDraftCompatibility(
    Object.assign({}, baseDraft, { user_type: USER_TYPES.WORKING_PROFESSIONAL }),
    questionnaire,
    selection
  ), 'selection_mismatch')
  assert.equal(getDraftCompatibility(
    Object.assign({}, baseDraft, { questionnaire_version: 'old-version' }),
    questionnaire,
    selection
  ), 'version_mismatch')
  assert.equal(getDraftCompatibility(
    Object.assign({}, baseDraft, { schema_version: 'old-schema' }),
    questionnaire,
    selection
  ), 'schema_mismatch')
})

test('草稿快照包含恢复所需的版本、身份、答案和当前位置', () => {
  const snapshot = createDraftSnapshot({
    questionnaire,
    selection: createSelection(),
    questions,
    answers: { q01: 5, q02: 4, unknown: 3 },
    currentIndex: 1,
    updatedAt: 123
  })

  assert.equal(snapshot.questionnaire_id, questionnaire.questionnaire_id)
  assert.equal(snapshot.questionnaire_version, questionnaire.questionnaire_version)
  assert.equal(snapshot.schema_version, questionnaire.question_schema_version)
  assert.equal(snapshot.scoring_version, questionnaire.scoring_version)
  assert.equal(snapshot.user_type, USER_TYPES.STUDENT)
  assert.equal(snapshot.assessment_type, ASSESSMENT_TYPES.STANDARD)
  assert.deepEqual(snapshot.answers, { q01: 5, q02: 4 })
  assert.equal(snapshot.currentIndex, 1)
})

test('选择和修改答案会立即保存，已答数量不会重复增加', () => {
  let savedDraft = null
  global.wx = {
    getStorageSync: () => '',
    setStorageSync(key, value) {
      savedDraft = value.drafts[0]
    }
  }
  const definition = loadAssessmentPage(global.wx)
  const page = createPageInstance(definition)
  page.selection = createSelection()
  page.loadAssessment({}, 0)

  page.selectAnswer({ currentTarget: { dataset: { value: 2 } } })
  assert.equal(page.data.currentAnswer, 2)
  assert.equal(page.data.answeredCount, 1)
  assert.equal(savedDraft.answers.q01, 2)

  page.selectAnswer({ currentTarget: { dataset: { value: 5 } } })
  assert.equal(page.data.currentAnswer, 5)
  assert.equal(page.data.answeredCount, 1)
  assert.equal(savedDraft.answers.q01, 5)

  page.goNext()
  assert.equal(page.data.currentIndex, 1)
  page.goPrevious()
  assert.equal(page.data.currentIndex, 0)
  assert.equal(page.data.currentAnswer, 5)
})

test('兼容草稿可恢复到保存题号和答案', () => {
  const selection = createSelection(USER_TYPES.WORKING_PROFESSIONAL)
  const draft = createDraftSnapshot({
    questionnaire,
    selection,
    questions,
    answers: { q01: 4, q03: 2 },
    currentIndex: 2,
    updatedAt: 123
  })
  let modalOptions = null
  const definition = loadAssessmentPage({
    getStorageSync(key) {
      return key === 'career_interest_draft_v1' ? draft : ''
    },
    showModal(options) {
      modalOptions = options
      options.success({ confirm: true })
    },
    redirectTo() {},
    navigateBack() {}
  })
  const page = createPageInstance(definition)

  page.onLoad({
    userType: USER_TYPES.WORKING_PROFESSIONAL,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })

  assert.equal(modalOptions.title, '继续上次测评？')
  assert.equal(page.data.currentIndex, 2)
  assert.equal(page.data.currentQuestion.id, 'q03')
  assert.equal(page.data.currentAnswer, 2)
  assert.equal(page.data.answeredCount, 2)
})

test('旧题库草稿不会与当前题库混合计分', () => {
  const selection = createSelection()
  const draft = Object.assign(createDraftSnapshot({
    questionnaire,
    selection,
    questions,
    answers: { q01: 5 },
    currentIndex: 0,
    updatedAt: 123
  }), {
    questionnaire_version: '0.2.0-prototype'
  })
  let modalOptions = null
  const definition = loadAssessmentPage({
    getStorageSync(key) {
      return key === 'career_interest_draft_v1' ? draft : ''
    },
    showModal(options) {
      modalOptions = options
    },
    redirectTo() {},
    navigateBack() {}
  })
  const page = createPageInstance(definition)

  page.onLoad({
    userType: USER_TYPES.STUDENT,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })

  assert.equal(modalOptions.title, '题库版本已更新')
  assert.match(modalOptions.content, /不能混合计分/)
  assert.equal(page.data.currentQuestion, null)
})

test('切换后台保存当前位置，卸载时跳过未变化的草稿', () => {
  let saveCount = 0
  let lastDraft = null
  const definition = loadAssessmentPage({
    getStorageSync: () => '',
    setStorageSync(key, value) {
      saveCount += 1
      lastDraft = value.drafts[0]
    }
  })
  const page = createPageInstance(definition)
  page.selection = createSelection()
  page.loadAssessment({ q01: 4 }, 0)

  page.onHide()
  page.onUnload()

  assert.equal(saveCount, 1)
  assert.equal(lastDraft.currentIndex, 0)
  assert.deepEqual(lastDraft.answers, { q01: 4 })
})
