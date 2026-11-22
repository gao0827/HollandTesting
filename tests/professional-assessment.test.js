const test = require('node:test')
const assert = require('node:assert/strict')
const { questionnaire, questions, sections, legacy } = require('../data/questionnaire-professional')
const standardQuestions = require('../data/questions')
const { calculateProfessionalResult, buildProfessionalProfile } = require('../services/professional-scoring')
const { calculateResult } = require('../services/riasec-scoring')
const { buildDeepReport } = require('../services/report-service')
const commerce = require('../services/commercial-service')
const storage = require('../utils/storage')

function makePage(route) {
  const modulePath = require.resolve(`../pages/${route}/${route}`)
  let page
  global.Page = (definition) => {
    page = {
      ...definition,
      data: structuredClone(definition.data),
      setData(fields) { Object.assign(this.data, fields) }
    }
  }
  try {
    delete require.cache[modulePath]
    require(modulePath)
  } finally {
    delete global.Page
  }
  return page
}

function event(dataset) {
  return { currentTarget: { dataset } }
}

test('专业版题库包含 250 道独立题目，章节题数和题号一致', () => {
  assert.equal(questions.length, questionnaire.item_count)
  assert.equal(questions.length, 250)
  assert.equal(new Set(questions.map((item) => item.text)).size, 250)
  assert.ok(questions.every(({ text }) => typeof text === 'string' && text.trim()))
  assert.deepEqual(questions.map(({ id, order }) => [id, order]), Array.from({ length: 250 }, (_, index) => [
    `p${String(index + 1).padStart(3, '0')}`, index + 1
  ]))
  assert.deepEqual(sections.map(({ id, count }) => [
    count, questions.filter((item) => item.section === id).length
  ]), [[60, 60], [50, 50], [50, 50], [45, 45], [45, 45]])
  const interests = questions.slice(0, 60)
  for (const code of questionnaire.dimension_order) {
    assert.equal(interests.filter(({ dimension }) => dimension === code).length, 10)
  }
  for (const section of sections.slice(1)) {
    const items = questions.filter(({ section: id }) => id === section.id)
    const groups = new Set(items.map(({ group }) => group))
    assert.equal(groups.size, 5)
    for (const group of groups) {
      assert.equal(items.filter((item) => item.group === group).length, section.count / groups.size)
    }
    assert.ok(items.every((item, index) => item.options === section.options
      && item.group !== items[index - 1]?.group
      && item.source.reference_framework !== 'Holland RIASEC'))
  }
  assert.equal(questionnaire.official_instrument, false)
})

test('四个附加板块独立计分，未尝试不计分且不改变 RIASEC', () => {
  const answers = Object.fromEntries(questions.map((item) => [item.id, item.section === 'ability' ? 6 : 3]))
  answers.p061 = 5
  const result = calculateProfessionalResult(answers)
  const standard = calculateResult(standardQuestions, Object.fromEntries(standardQuestions.map((item) => [item.id, 3])))
  assert.deepEqual(result.rawScores, standard.rawScores)
  assert.deepEqual(result.professionalScores.ability[0], {
    id: 'analysis', name: '分析与判断', total: 10, answered: 1, percentage: null
  })
  assert.equal(result.professionalScores.ability[1].percentage, null)
  const analysisItems = questions.filter((item) => item.group === 'analysis')
  for (const item of analysisItems.slice(1, 5)) answers[item.id] = 5
  const sufficient = calculateProfessionalResult(answers)
  assert.equal(sufficient.professionalScores.ability[0].percentage, 100)
  assert.equal(sufficient.professionalScores.ability[0].answered, 5)
  const [skills, values] = buildProfessionalProfile({ professional_scores: sufficient.professionalScores })
  assert.match(skills.summary, /只有「分析与判断」可计分/)
  assert.match(skills.coverage, /5 \/ 50 题 · 1 \/ 5 个主题/)
  assert.match(skills.checks[0].action, /用证据取舍/)
  assert.equal(values.focusNames, '')
  assert.equal(calculateProfessionalResult(answers, legacy).professionalScores.ability[0].answered, 2)
  assert.ok(result.professionalScores.career_values.every((group) => group.percentage === 50))
  const changed = calculateProfessionalResult({ ...answers, p111: 5 })
  assert.deepEqual(changed.rawScores, result.rawScores)
  assert.equal(changed.professionalScores.career_values[0].percentage, 55)
  assert.throws(() => calculateProfessionalResult({ ...answers, p111: 6 }), /非法选项/)
  assert.throws(() => calculateProfessionalResult({ ...answers, p111: [4] }), /非法选项/)
  const { p250, ...incomplete } = answers
  assert.throws(() => calculateProfessionalResult(incomplete), /答案不完整/)
  assert.equal(buildProfessionalProfile({ professional_scores: result.professionalScores }).length, 4)
  assert.match(buildProfessionalProfile({ professional_scores: result.professionalScores })[0].summary, /至少需要 5 道/)
})

test('旧专业版草稿可续答并按原题本计分，也可清空后改用新版', (t) => {
  const memory = new Map()
  let continueLegacy = true
  global.wx = {
    getStorageSync: (key) => structuredClone(memory.get(key) ?? ''),
    setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
    removeStorageSync: (key) => memory.delete(key),
    showModal({ content, success }) {
      assert.match(content, /可以按原题目续答/)
      success({ confirm: continueLegacy })
    },
    redirectTo() {}
  }
  t.after(() => { delete global.wx })

  const selection = { userType: 'student', assessmentType: 'professional' }
  const answers = Object.fromEntries(legacy.questions.slice(0, -1).map((item) => [
    item.id, item.id === 'p061' ? 5 : item.section === 'ability' ? 6 : 3
  ]))
  const draft = {
    user_type: selection.userType,
    assessment_type: selection.assessmentType,
    questionnaire_id: legacy.questionnaire.questionnaire_id,
    questionnaire_version: legacy.questionnaire.questionnaire_version,
    schema_version: legacy.questionnaire.question_schema_version,
    answers,
    currentIndex: 61
  }

  storage.saveDraft(draft)
  const resumed = makePage('assessment')
  resumed.onLoad(selection)
  assert.equal(resumed.data.currentQuestion.text, legacy.questions[61].text)
  assert.equal(resumed.data.currentQuestion.id, 'p062')
  assert.equal(resumed.data.currentAnswer, 6)
  resumed.updateQuestion(249)
  resumed.selectAnswer(event({ value: 3 }))
  resumed.goNext()
  const record = storage.getRecord()
  assert.equal(record.questionnaire_version, legacy.questionnaire.questionnaire_version)
  assert.equal(record.scoring_version, legacy.questionnaire.scoring_version)
  assert.equal(record.professional_scores.ability[0].percentage, 100)

  continueLegacy = false
  storage.saveDraft(draft)
  const restarted = makePage('assessment')
  restarted.onLoad(selection)
  assert.equal(restarted.data.currentQuestion.text, questions[0].text)
  assert.equal(restarted.data.answeredCount, 0)
  assert.equal(storage.getDraft(selection), null)
  assert.equal(storage.getRecord().id, record.id)
})

test('从首页进入专业版，完成 250 题后可分别观看广告和进入付费详解', async (t) => {
  const memory = new Map()
  const routes = []
  global.wx = {
    getStorageSync: (key) => structuredClone(memory.get(key) ?? ''),
    setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
    removeStorageSync: (key) => memory.delete(key),
    navigateTo: ({ url }) => routes.push(url),
    redirectTo: ({ url }) => routes.push(url),
    showToast() {},
    showModal({ success }) { success({ confirm: true }) }
  }
  t.after(() => { delete global.wx })
  const options = { userType: 'career_starter', assessmentType: 'professional' }
  storage.saveDraft({ user_type: 'student', assessment_type: 'standard', answers: { q01: 4 } })
  const home = makePage('index')
  home.openProfessionalAssessment()
  assert.equal(routes.pop(), '/pages/selection/selection?assessmentType=professional')

  const selection = makePage('selection')
  selection.onLoad(options)
  selection.continueAssessment()
  assert.equal(routes.pop(), '/pages/assessment/assessment?userType=career_starter&assessmentType=professional')

  const initial = makePage('assessment')
  initial.onLoad(options)
  assert.equal(initial.data.total, 250)
  assert.equal(initial.data.currentQuestion.id, 'p001')
  for (let index = 0; index < 60; index += 1) {
    initial.selectAnswer(event({ value: 3 }))
    initial.goNext()
  }
  assert.equal(initial.data.sectionLabel, '技能自评')
  assert.equal(initial.data.currentNumber, 61)
  assert.equal(initial.data.total, 250)
  initial.selectAnswer(event({ value: 6 }))
  initial.onUnload()

  home.onShow()
  home.openProfessionalAssessment()
  assert.equal(routes.pop(), '/pages/selection/selection?assessmentType=professional&userType=career_starter')

  const resumed = makePage('assessment')
  resumed.onLoad(options)
  assert.equal(resumed.data.currentQuestion.id, 'p061')
  assert.equal(resumed.data.currentAnswer, 6)
  resumed.submitAssessment()
  assert.equal(storage.getRecord(), null)
  for (let index = 60; index < 250; index += 1) {
    const { section, group } = questions[index]
    resumed.selectAnswer(event({ value: section === 'ability' ? 6 : group === 'growth' ? 5 : 4 }))
    resumed.goNext()
  }

  const record = storage.getRecord()
  assert.equal(record.assessment_type, 'professional')
  assert.equal(record.user_type, 'career_starter')
  assert.equal(record.questionnaire_id, questionnaire.questionnaire_id)
  assert.equal(record.scoring_version, questionnaire.scoring_version)
  assert.equal(record.answers.length, 250)
  assert.equal(record.professional_scores.ability[0].percentage, null)
  assert.equal(storage.getDraft(options), null)
  assert.deepEqual(storage.getDraft({ userType: 'student', assessmentType: 'standard' }).answers, { q01: 4 })
  assert.equal(routes.pop(), `/pages/result/result?id=${record.id}`)

  const result = makePage('result')
  result.onLoad({ id: record.id })
  assert.equal(result.data.paidReport, true)
  assert.equal(result.data.basicLocked, true)
  assert.deepEqual(result.data.dimensions, [])
  assert.equal(result.data.basicReading, null)
  assert.equal(result.data.professionalProfile, undefined)
  result.openReport()
  assert.equal(routes.pop(), `/pages/report/report?id=${record.id}`)
  const report = makePage('report')
  storage.saveReport(record.id, buildDeepReport(record), '180')
  report.onLoad({ id: record.id })
  assert.equal(report.data.paidReport, true)
  assert.equal(report.data.checkoutAvailable, false)
  assert.equal(report.data.report, null)
  assert.deepEqual(report.data.professionalProfile, [])

  const detail = makePage('history-detail')
  detail.onLoad({ id: record.id })
  detail.onShow()
  assert.equal(detail.data.basicLocked, true)

  let status = { status: 'locked', priceFen: 900, quoteId: 'first-quote' }
  let quoteChanged = true
  let generationCount = 0
  t.mock.method(commerce, 'verifyOrder', async (id) => {
    assert.equal(id, record.id)
    return status
  })
  t.mock.method(commerce, 'startPayment', async (id, quote) => {
    assert.equal(id, record.id)
    assert.equal(quote.quoteId, status.quoteId)
    if (quoteChanged) throw Object.assign(new Error('报价变化'), { code: 'QUOTE_CHANGED' })
    return { status: 'pending' }
  })
  t.mock.method(commerce, 'unlockReport', async (id, summary) => {
    generationCount += 1
    assert.equal(id, record.id)
    assert.equal(summary.userType, 'career_starter')
    assert.deepEqual(summary.professionalScores, record.professional_scores)
    assert.equal(summary.answers, undefined)
    return { report: buildDeepReport(record), professionalProfile: [] }
  })
  report.setData({ checkoutAvailable: true })
  await report.loadPurchasedReport()
  assert.equal(generationCount, 0)
  await report.refreshOrder()
  assert.equal(report.data.priceText, '¥9.00')
  await report.buyReport()
  assert.match(report.data.checkoutError, /重新查询价格/)
  assert.equal(report.data.priceText, '')
  status = { status: 'locked', priceFen: 1200, quoteId: 'second-quote' }
  quoteChanged = false
  await report.refreshOrder()
  assert.equal(report.data.priceText, '¥12.00')
  await report.buyReport()
  assert.equal(report.data.checkoutState, 'pending')
  await report.loadPurchasedReport()
  assert.equal(generationCount, 0)
  status = { status: 'unlocked' }
  await report.refreshOrder()
  assert.equal(report.data.report, null)
  await report.loadPurchasedReport()
  assert.equal(generationCount, 1)
  assert.equal(report.data.report.plan.label, '职场新人路线')
  assert.equal(report.data.professionalProfile.length, 4)
  assert.match(report.data.decisionSteps[2].text, /学习与成长/)
  assert.equal(report.data.decisionSteps[3].title, '了解入门岗位')

  let videoCompleted = false
  t.mock.method(commerce, 'getBasicReportAdUnit', () => 'adunit-abc123')
  t.mock.method(commerce, 'watchBasicReportAd', async () => videoCompleted)
  result.loadRecord(record.id)
  await result.unlockBasicReport()
  assert.equal(result.data.basicLocked, true)
  assert.equal(storage.getRecord(record.id).basic_report_ad_completed, undefined)
  videoCompleted = true
  await result.unlockBasicReport()
  assert.equal(result.data.basicLocked, false)
  assert.equal(result.data.dimensions.length, 6)
  assert.match(result.data.basicReading.comparison, /得分相同/)
  assert.equal(result.data.basicReading.nextTitle, '了解入门岗位')
  assert.equal(storage.getRecord(record.id).basic_report_ad_completed, true)
  detail.onShow()
  assert.equal(detail.data.basicLocked, false)
  const reopened = makePage('result')
  reopened.onLoad({ id: record.id })
  assert.equal(reopened.data.basicLocked, false)
  const paidAgain = makePage('report')
  paidAgain.onLoad({ id: record.id })
  assert.equal(paidAgain.data.report, null)
})
