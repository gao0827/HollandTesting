const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const appConfig = require(path.join(ROOT, 'app.json'))
const {
  USER_TYPES,
  ASSESSMENT_TYPES,
  FEATURE_FLAGS
} = require(path.join(ROOT, 'config/product'))
const standardQuestionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))
const {
  ASSESSMENT_ROLE_OPTIONS,
  parseAssessmentSelection,
  canStartAssessment,
  buildAssessmentUrl
} = require(path.join(ROOT, 'services/assessment-selection'))
const { createCompletedAssessmentRecord } = require(path.join(ROOT, 'models/assessment-record'))
const { hasCompleteAssessmentContract } = require(path.join(ROOT, 'models/assessment-contract'))

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function loadPage(relativePath, wxMock) {
  let definition = null
  global.Page = (value) => {
    definition = value
  }
  global.wx = wxMock
  const absolutePath = path.join(ROOT, relativePath)
  delete require.cache[require.resolve(absolutePath)]
  require(absolutePath)
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

test('M03 测评选择页已注册并具备原生页面四件套', () => {
  assert.equal(appConfig.pages.includes('pages/selection/selection'), true)
  ;['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
    assert.equal(
      fs.existsSync(path.join(ROOT, `pages/selection/selection${extension}`)),
      true,
      extension
    )
  })
})

test('选择服务支持四种角色和两个版本，并识别旧版职场角色', () => {
  const studentStandard = parseAssessmentSelection({
    userType: USER_TYPES.STUDENT,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })
  const workerProfessional = parseAssessmentSelection({
    userType: USER_TYPES.WORKING_PROFESSIONAL,
    assessmentType: ASSESSMENT_TYPES.PROFESSIONAL
  })
  const invalidUser = parseAssessmentSelection({
    userType: 'invalid',
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })

  assert.equal(studentStandard.userTypeLabel, '高中生、大学生')
  assert.equal(workerProfessional.userTypeLabel, '职场人士')
  assert.equal(canStartAssessment(studentStandard), true)
  assert.equal(canStartAssessment(workerProfessional), true)
  assert.equal(canStartAssessment(invalidUser), false)
  assert.equal(FEATURE_FLAGS.professionalAssessment, true)
  assert.equal(
    buildAssessmentUrl(studentStandard),
    '/pages/assessment/assessment?userType=student&assessmentType=standard'
  )
  assert.equal(buildAssessmentUrl(workerProfessional), '/pages/assessment/assessment?userType=working_professional&assessmentType=professional')
  assert.deepEqual(ASSESSMENT_ROLE_OPTIONS.map(({ value }) => value), [
    USER_TYPES.STUDENT, USER_TYPES.CAREER_STARTER, USER_TYPES.CAREER_TRANSITION, USER_TYPES.CAREER_ADVISOR
  ])
  for (const { value, title } of ASSESSMENT_ROLE_OPTIONS) {
    for (const assessmentType of Object.values(ASSESSMENT_TYPES)) {
      const selection = parseAssessmentSelection({ userType: value, assessmentType })
      assert.equal(selection.userTypeLabel, title)
      assert.equal(buildAssessmentUrl(selection), `/pages/assessment/assessment?userType=${value}&assessmentType=${assessmentType}`)
    }
  }
})

test('选择页显示四张角色卡和首页已选版本', () => {
  const script = read('pages/selection/selection.js')
  const wxml = read('pages/selection/selection.wxml')
  const style = read('pages/selection/selection.wxss')
  const page = createPageInstance(loadPage('pages/selection/selection.js', {}))
  page.onLoad()
  assert.deepEqual(page.data.userOptions.map(({ title, description }) => [title, description]), [
    ['高中生、大学生', '专业选择、职业探索'],
    ['职场新人', '了解职业偏好、岗位方向'],
    ['职场转型人群', '重新探索工作方向'],
    ['家长、职业辅导者', '辅助讨论专业与职业选择']
  ])
  page.selectUserType({ currentTarget: { dataset: { value: USER_TYPES.CAREER_ADVISOR } } })
  assert.equal(page.data.isAdvisor, true)
  assert.equal(page.data.userOptions.filter(({ selected }) => selected).length, 1)
  assert.match(style, /\.user-option-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(script, /标准版/)
  assert.match(script, /selectedVersionLabel:\s*selection\.assessmentTypeLabel/)
  assert.match(wxml, /selectUserType/)
  assert.match(wxml, /已选择测评/)
  assert.match(wxml, /陪同测评时，请让测评者按自己的感受和经历作答/)
  assert.doesNotMatch(wxml, /selectAssessmentType/)
  assert.doesNotMatch(wxml, /选择测评版本/)
  assert.doesNotMatch(wxml, /version-grid/)
  assert.match(wxml, /continueAssessment/)
  assert.match(wxml, /当前阶段不连接后台或付费接口/)
  assert.doesNotMatch(script, /requestPayment/)
})

test('首页传入的版本直接生效，用户只需选择阶段', () => {
  let navigateTarget = ''
  const definition = loadPage('pages/selection/selection.js', {
    navigateTo(options) {
      navigateTarget = options.url
    },
    showToast() {}
  })
  const page = createPageInstance(definition)

  page.onLoad({ assessmentType: ASSESSMENT_TYPES.STANDARD })
  page.selectUserType({ currentTarget: { dataset: { value: USER_TYPES.STUDENT } } })
  page.continueAssessment()
  assert.equal(
    navigateTarget,
    '/pages/assessment/assessment?userType=student&assessmentType=standard'
  )

  const professionalPage = createPageInstance(definition)
  professionalPage.onLoad({ assessmentType: ASSESSMENT_TYPES.PROFESSIONAL })
  professionalPage.selectUserType({
    currentTarget: { dataset: { value: USER_TYPES.CAREER_TRANSITION } }
  })
  professionalPage.continueAssessment()
  assert.equal(professionalPage.data.selectedVersionLabel, '专业版')
  assert.equal(professionalPage.data.selectedVersionCount, 250)
  assert.equal(navigateTarget, '/pages/assessment/assessment?userType=career_transition&assessmentType=professional')
})

test('答题页拒绝缺少身份的直达请求，并接受有效标准版选择', () => {
  let redirectTarget = ''
  const definition = loadPage('pages/assessment/assessment.js', {
    getStorageSync() {
      return null
    },
    redirectTo(options) {
      redirectTarget = options.url
    },
    showModal() {},
    navigateBack() {}
  })

  const invalidPage = createPageInstance(definition)
  invalidPage.onLoad({ assessmentType: ASSESSMENT_TYPES.STANDARD })
  assert.equal(redirectTarget, '/pages/selection/selection?assessmentType=standard')

  redirectTarget = ''
  const validPage = createPageInstance(definition)
  validPage.onLoad({
    userType: USER_TYPES.WORKING_PROFESSIONAL,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })
  assert.equal(redirectTarget, '')
  assert.equal(validPage.data.userTypeLabel, '职场人士')
  assert.equal(validPage.data.currentNumber, 1)
  assert.equal(validPage.data.total, 60)
})

test('完成记录写入用户类型、测评类型和核心数据契约', () => {
  const result = {
    code: 'RIA',
    topDimensions: [{ code: 'R' }, { code: 'I' }, { code: 'A' }],
    rawScores: { R: 50, I: 40, A: 30, S: 20, E: 10, C: 10 },
    dimensions: [],
    boundaryTie: false
  }
  const record = createCompletedAssessmentRecord({
    questionnaire: standardQuestionnaire,
    selection: parseAssessmentSelection({
      userType: USER_TYPES.STUDENT,
      assessmentType: ASSESSMENT_TYPES.STANDARD
    }),
    answers: { q2: 4, q1: 5 },
    result,
    completedAt: 123456789
  })

  assert.equal(hasCompleteAssessmentContract(record), true)
  assert.equal(record.user_type, USER_TYPES.STUDENT)
  assert.equal(record.assessment_type, ASSESSMENT_TYPES.STANDARD)
  assert.equal(record.questionnaire_id, standardQuestionnaire.questionnaire_id)
  assert.deepEqual(record.answers, [
    { question_id: 'q1', selected_value: 5 },
    { question_id: 'q2', selected_value: 4 }
  ])
  assert.deepEqual(record.top_codes, ['R', 'I', 'A'])
  assert.deepEqual(record.riasec_scores, result.rawScores)
})

test('答题草稿保存当前用户身份与版本', () => {
  let savedDraft = null
  const definition = loadPage('pages/assessment/assessment.js', {
    getStorageSync: () => '',
    setStorageSync(key, value) {
      savedDraft = value.drafts[0]
    }
  })
  const page = createPageInstance(definition)
  page.selection = parseAssessmentSelection({
    userType: USER_TYPES.STUDENT,
    assessmentType: ASSESSMENT_TYPES.STANDARD
  })
  page.answers = { q01: 5 }
  page.saveCurrentDraft(1)

  assert.equal(savedDraft.user_type, USER_TYPES.STUDENT)
  assert.equal(savedDraft.assessment_type, ASSESSMENT_TYPES.STANDARD)
  assert.equal(savedDraft.questionnaire_id, standardQuestionnaire.questionnaire_id)
  assert.deepEqual(savedDraft.answers, { q01: 5 })
})
