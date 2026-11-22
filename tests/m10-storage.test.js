const test = require('node:test')
const assert = require('node:assert/strict')
const storage = require('../utils/storage')
const { buildDeepReport } = require('../services/report-service')
const { USER_TYPES, PRODUCT_CONFIG } = require('../config/product')

const HISTORY_KEY = 'career_interest_history_v1'
const LEGACY_DRAFT_KEY = 'career_interest_draft_v1'
const scores = { R: 50, I: 40, A: 30, S: 20, E: 15, C: 10 }

function record(id, userType = USER_TYPES.STUDENT) {
  return { assessment_id: id, user_type: userType, completion_status: 'completed', riasec_scores: scores }
}

function draft(userType, answer) {
  return { user_type: userType, assessment_type: 'standard', answers: { q01: answer } }
}

function mockStorage(t, initial = {}) {
  const values = new Map(Object.entries(initial))
  const writes = { fail: false, failRemove: false, failWhen: () => false }
  global.wx = {
    getStorageSync: (key) => structuredClone(values.get(key) ?? ''),
    setStorageSync(key, next) {
      if (writes.fail || writes.failWhen(next)) throw new Error('写入失败')
      values.set(key, structuredClone(next))
    },
    removeStorageSync(key) {
      if (writes.failRemove) throw new Error('清除旧键失败')
      values.delete(key)
    },
    showToast() {},
    showModal({ success }) { success({ confirm: true }) }
  }
  t.after(() => { delete global.wx })
  return { values, writes }
}

function loadPage(route) {
  const path = require.resolve(`../pages/${route}/${route}`)
  let page
  global.Page = (definition) => {
    page = {
      ...definition,
      data: { ...definition.data },
      setData(update) { Object.assign(this.data, update) }
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

test('按旧 ID 读取历史，迁移保留原始分数且不填造身份或答卷', (t) => {
  const legacy = { id: 123, completedAt: 123, code: 'RIA', version: '1.0', rawScores: scores }
  const { values } = mockStorage(t, {
    [HISTORY_KEY]: [legacy],
    [LEGACY_DRAFT_KEY]: { answers: { q01: 3 }, currentIndex: 0 }
  })
  const migrated = storage.getRecord('123')
  assert.equal(migrated.assessment_id, '123')
  assert.equal(migrated.created_at, 123)
  assert.equal(migrated.questionnaire_version, '1.0')
  assert.equal(migrated.user_type, null)
  assert.equal(migrated.answers, null)
  assert.deepEqual(migrated.riasec_scores, scores)
  assert.equal(buildDeepReport(migrated).plan.label, '通用路线')
  assert.deepEqual(values.get(HISTORY_KEY), [legacy])

  const resumed = storage.getDraft(draft(USER_TYPES.STUDENT, 3))
  storage.saveDraft(draft(USER_TYPES.STUDENT, 4), storage.getDraftId(resumed))
  assert.equal(values.get(HISTORY_KEY).version, 2)
  assert.equal(values.has(LEGACY_DRAFT_KEY), false)
  assert.equal(storage.getDataSummary().drafts.length, 1)
  assert.equal(storage.getDraft(draft(USER_TYPES.STUDENT, 0)).answers.q01, 4)
  assert.equal(storage.getDraft(draft(USER_TYPES.WORKING_PROFESSIONAL, 0)), null)
})

test('迁移中断或提交写入失败时保留可恢复的草稿与历史', (t) => {
  const oldDraft = draft(USER_TYPES.STUDENT, 4)
  const { values, writes } = mockStorage(t, {
    [HISTORY_KEY]: [record('old')],
    [LEGACY_DRAFT_KEY]: oldDraft
  })
  writes.failRemove = true
  assert.throws(() => storage.clearAllData(), /清除旧键失败/)
  assert.ok(values.has(LEGACY_DRAFT_KEY))
  assert.ok(storage.getRecord('old'))
  assert.deepEqual(storage.getDraft(oldDraft), oldDraft)

  writes.failRemove = false
  writes.failWhen = (state) => state.records[0]?.id === 'new'
  assert.throws(() => storage.saveRecord(record('new'), [storage.getDraftId(oldDraft)]), /写入失败/)
  assert.equal(storage.getRecord('new'), null)
  assert.deepEqual(storage.getDraft(oldDraft), oldDraft)
  writes.failWhen = () => false
  storage.saveRecord(record('new'), [storage.getDraftId(oldDraft)])
  assert.ok(storage.getRecord('new'))
  assert.equal(storage.getDraft(oldDraft), null)
  assert.equal(values.has(LEGACY_DRAFT_KEY), false)
})

test('学生与职场分别续答，完成或删除一份草稿只影响对应身份', (t) => {
  mockStorage(t)
  const student = draft(USER_TYPES.STUDENT, 5)
  const worker = draft(USER_TYPES.WORKING_PROFESSIONAL, 2)
  storage.saveDraft(student)
  storage.saveDraft(worker)
  assert.deepEqual(storage.getDraft(student), student)
  assert.deepEqual(storage.getDraft(worker), worker)
  const settings = loadPage('data-settings')
  settings.onShow()
  assert.match(settings.data.drafts.find((item) => item.label === '学生').url, /userType=student/)

  storage.saveRecord(record('done'), [storage.getDraftId(student)])
  assert.equal(storage.getDraft(student), null)
  assert.deepEqual(storage.getDraft(worker), worker)
  settings.onShow()
  settings.deleteDraft({ currentTarget: { dataset: { id: storage.getDraftId(worker) } } })
  assert.equal(storage.getDraft(worker), null)
  assert.ok(storage.getRecord('done'))
})

test('报告保存和重新打开保留所选路线，单独删除报告时原记录仍可用', (t) => {
  mockStorage(t)
  storage.saveRecord(record('one'))
  const page = loadPage('report')
  page.onLoad({ id: 'one' })
  page.selectHorizon({ currentTarget: { dataset: { horizon: '180' } } })
  page.saveReport()

  const history = loadPage('history')
  history.onShow()
  assert.equal(history.data.records[0].hasSavedReport, true)
  const detail = loadPage('history-detail')
  detail.onLoad({ id: 'one' })
  detail.onShow()
  assert.equal(detail.data.savedReportUrl, '/pages/report/report?id=one')

  const reopened = loadPage('report')
  reopened.onLoad({ id: 'one' })
  assert.equal(reopened.data.horizon, '180')
  assert.equal(reopened.data.milestones.length, 6)
  reopened.deleteSavedReport()
  assert.equal(storage.getSavedReport('one'), null)
  assert.ok(storage.getRecord('one'))
})

test('历史保留上限、单条删除和全部清除不会留下孤立报告或影响其他本地键', (t) => {
  const { values } = mockStorage(t, { other: 'untouched' })
  const worker = draft(USER_TYPES.WORKING_PROFESSIONAL, 4)
  storage.saveDraft(worker)
  storage.saveRecord(record('oldest'))
  storage.saveReport('oldest', buildDeepReport(storage.getRecord('oldest')), '90')
  for (let index = 0; index < PRODUCT_CONFIG.maxLocalHistory; index += 1) storage.saveRecord(record(String(index)))
  assert.equal(storage.readHistory().length, PRODUCT_CONFIG.maxLocalHistory)
  assert.equal(storage.getSavedReport('oldest'), null)

  storage.saveReport('1', buildDeepReport(storage.getRecord('1')), '180')
  storage.removeRecord('1')
  assert.equal(storage.getSavedReport('1'), null)
  assert.throws(() => storage.saveReport('1', {}, '90'), /测评记录已删除/)
  storage.clearHistory()
  assert.deepEqual(storage.getDraft(worker), worker)
  const settings = loadPage('data-settings')
  settings.onShow()
  settings.deleteAll()
  assert.deepEqual(storage.getDataSummary(), { recordCount: 0, reportIds: [], drafts: [], hasData: false })
  assert.equal(values.get('other'), 'untouched')
})

test('未知存储格式暂停写入，避免覆盖原始数据', (t) => {
  const unknown = { version: 3, content: ['保留'] }
  const { values } = mockStorage(t, { [HISTORY_KEY]: unknown })
  const page = loadPage('data-settings')
  page.onShow()
  assert.equal(page.data.loadFailed, true)
  assert.throws(() => storage.saveRecord(record('new')), /无法读取/)
  assert.deepEqual(values.get(HISTORY_KEY), unknown)
})
