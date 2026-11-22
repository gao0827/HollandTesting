const test = require('node:test')
const assert = require('node:assert/strict')
const { FEATURE_FLAGS, USER_TYPES } = require('../config/product')
const { createCompletedAssessmentRecord } = require('../models/assessment-record')
const { calculateResult } = require('../services/riasec-scoring')
const { buildDeepReport } = require('../services/report-service')
const { getCareer, getCase } = require('../services/knowledge-service')
const questionnaire = require('../data/questionnaire-standard')
const questions = require('../data/questions')

function makeRecord(userType, values, completedAt = 1700000000000) {
  const answers = Object.fromEntries(questions.map((item) => [item.id, values[item.dimension]]))
  return createCompletedAssessmentRecord({
    questionnaire,
    selection: { userType, assessmentType: 'standard' },
    answers,
    result: calculateResult(questions, answers),
    completedAt
  })
}

function loadPage(route) {
  const path = require.resolve(`../pages/${route}/${route}`)
  let page
  global.Page = (definition) => {
    page = {
      ...definition,
      data: { ...definition.data },
      setData(update) {
        Object.assign(this.data, update)
      }
    }
  }
  try {
    delete require.cache[path]
    require(path)
  } finally {
    delete global.Page
  }
  return page
}

const distinct = { R: 2, I: 5, A: 4, S: 3, E: 2, C: 1 }

test('四种角色各有 90 天与 180 天行动路线，兼容旧职场路线', () => {
  const student = buildDeepReport(makeRecord(USER_TYPES.STUDENT, distinct))
  const employee = buildDeepReport(makeRecord(USER_TYPES.WORKING_PROFESSIONAL, distinct))
  assert.equal(student.profile.code, 'IAS')
  assert.equal(student.plan.label, '学生路线')
  assert.equal(employee.plan.label, '职场路线')
  const newRoutes = [
    [USER_TYPES.CAREER_STARTER, '职场新人路线'],
    [USER_TYPES.CAREER_TRANSITION, '职场转型路线'],
    [USER_TYPES.CAREER_ADVISOR, '家长与辅导者路线']
  ].map(([role, label]) => {
    const report = buildDeepReport(makeRecord(role, distinct))
    assert.equal(report.plan.label, label)
    return report
  })
  const reports = [student, employee, ...newRoutes]
  assert.equal(new Set(reports.map((report) => report.plan.milestones[0].title)).size, reports.length)
  for (const report of reports) {
    assert.deepEqual(report.profile, student.profile)
    assert.equal(report.plan.milestones.length, 6)
    assert.match(report.plan.milestones[2].period, /90/)
    assert.match(report.plan.milestones[5].period, /180/)
    assert.ok(report.plan.milestones.every((stage) => stage.action && stage.output))
    assert.deepEqual(report.careers.map((career) => getCareer(career.id).dimension), ['I', 'A', 'S'])
    assert.ok(report.cases.every((entry) => getCase(entry.id)))
  }
})

test('前三边界并列与六维同分都保留同分方向，不根据展示顺序缩小建议', () => {
  const tied = buildDeepReport(makeRecord(USER_TYPES.STUDENT, { R: 5, I: 5, A: 4, S: 4, E: 2, C: 1 }))
  assert.deepEqual(tied.profile.activities.map((item) => item.code), ['R', 'I', 'A', 'S'])
  assert.equal(tied.careers.length, 4)
  assert.match(tied.profile.tieNotes[0], /并列最高分/)
  assert.match(tied.profile.tieNotes[1], /前三边界并列/)
  const flat = buildDeepReport(makeRecord(USER_TYPES.STUDENT, { R: 3, I: 3, A: 3, S: 3, E: 3, C: 3 }))
  assert.equal(flat.profile.activities.length, 6)
  assert.match(flat.profile.tieNotes[0], /六个维度得分相同/)
})

test('旧记录走通用路线，缺分或未完成记录不生成报告', () => {
  const record = makeRecord(USER_TYPES.STUDENT, distinct)
  const legacy = buildDeepReport({ rawScores: record.rawScores })
  assert.equal(legacy.plan.label, '通用路线')
  assert.equal(legacy.profile.code, record.code)
  assert.ok(legacy.profile.dimensions.every((item) => item.percentage === null))
  assert.equal(buildDeepReport({ rawScores: { R: 40 } }), null)
  assert.equal(buildDeepReport({ ...record, completion_status: 'draft' }), null)
})

test('从结果页打开指定记录的报告，路线切换不改写本地记录', () => {
  assert.equal(FEATURE_FLAGS.deepReport, true)
  const student = makeRecord(USER_TYPES.STUDENT, distinct)
  const employee = makeRecord(USER_TYPES.WORKING_PROFESSIONAL, distinct, 1700000000001)
  global.wx = { getStorageSync: (key) => key === 'career_interest_history_v1' ? [employee, student] : '' }
  try {
    const resultPage = loadPage('result')
    resultPage.onLoad({ id: student.id })
    assert.equal(resultPage.data.reportUrl, `/pages/report/report?id=${student.id}`)
    assert.match(resultPage.data.combinationSummary, /分析证据/)

    const reportPage = loadPage('report')
    reportPage.onLoad({ id: student.id })
    assert.equal(reportPage.data.report.plan.label, '学生路线')
    assert.equal(reportPage.data.milestones.length, 3)
    reportPage.selectHorizon({ currentTarget: { dataset: { horizon: '180' } } })
    assert.equal(reportPage.data.milestones.length, 6)
    reportPage.selectHorizon({ currentTarget: { dataset: { horizon: '90' } } })
    assert.equal(reportPage.data.milestones.length, 3)

    const unavailable = loadPage('report')
    unavailable.onLoad()
    assert.equal(unavailable.data.report, null)
    unavailable.onLoad({ id: 'unknown' })
    assert.equal(unavailable.data.report, null)
  } finally {
    delete global.wx
  }
})
