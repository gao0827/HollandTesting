const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const storage = require('../utils/storage')
const { pages, sitemapLocation } = require('../app.json')
const { checkProjectConfig } = require('../scripts/check-release')
const questions = require('../data/questions')

function pageInstance(route) {
  const filename = require.resolve(`../${route}.js`)
  let page
  global.Page = (definition) => {
    page = {
      ...definition,
      data: structuredClone(definition.data),
      answers: definition.answers ? {} : undefined,
      setData(update) { Object.assign(this.data, update) }
    }
  }
  try {
    delete require.cache[filename]
    require(filename)
  } finally {
    delete global.Page
  }
  return page
}

function event(dataset) {
  return { currentTarget: { dataset } }
}

test('完整测评会保留另一身份的草稿，报告可保存、重新打开和清除', (t) => {
  const values = new Map()
  const navigation = []
  const notices = []
  let confirm = true
  global.wx = {
    getStorageSync: (key) => structuredClone(values.get(key) ?? ''),
    setStorageSync: (key, value) => values.set(key, structuredClone(value)),
    removeStorageSync: (key) => values.delete(key),
    navigateTo: ({ url }) => navigation.push(url),
    redirectTo: ({ url }) => navigation.push(url),
    showModal: ({ success }) => success?.({ confirm, cancel: !confirm }),
    showToast: ({ title }) => notices.push(title)
  }
  t.after(() => { delete global.wx })

  const home = pageInstance('pages/index/index')
  home.onShow()
  home.startAssessment()
  assert.equal(navigation.pop(), '/pages/selection/selection?assessmentType=standard')
  const selection = pageInstance('pages/selection/selection')
  selection.onLoad({ assessmentType: 'standard' })
  selection.selectUserType(event({ value: 'student' }))
  selection.continueAssessment()
  assert.match(navigation.pop(), /userType=student&assessmentType=standard$/)
  const student = { userType: 'student', assessmentType: 'standard' }
  const worker = { userType: 'working_professional', assessmentType: 'standard' }

  const initial = pageInstance('pages/assessment/assessment')
  initial.onLoad(student)
  initial.goNext()
  assert.equal(initial.data.currentIndex, 0)
  assert.match(notices.at(-1), /请选择|请先选择/)
  initial.selectAnswer(event({ value: 5 }))
  initial.goNext()
  initial.onHide()
  initial.onUnload()

  const other = pageInstance('pages/assessment/assessment')
  other.onLoad(worker)
  other.selectAnswer(event({ value: 2 }))
  other.onUnload()

  home.onShow()
  home.startAssessment()
  assert.equal(navigation.pop(), '/pages/selection/selection?assessmentType=standard&userType=working_professional')
  const fromOldDraft = pageInstance('pages/selection/selection')
  fromOldDraft.onLoad(worker)
  assert.equal(fromOldDraft.data.userOptions.length, 4)
  assert.equal(fromOldDraft.data.canContinue, false)
  assert.equal(fromOldDraft.data.legacyDraftUrl, '/pages/assessment/assessment?userType=working_professional&assessmentType=standard')

  const resumed = pageInstance('pages/assessment/assessment')
  resumed.onLoad(student)
  assert.equal(resumed.data.currentIndex, 1)
  assert.equal(resumed.data.answeredCount, 1)
  for (let i = 1; i < questions.length; i += 1) {
    resumed.selectAnswer(event({ value: 3 }))
    resumed.goNext()
  }
  const record = storage.getRecord()
  assert.equal(record.answers.length, 60)
  assert.deepEqual(record.riasec_scores, { R: 32, I: 30, A: 30, S: 30, E: 30, C: 30 })
  assert.equal(storage.getDraft(student), null)
  assert.equal(storage.getDraft(worker).answers.q01, 2)
  assert.equal(navigation.pop(), `/pages/result/result?id=${record.id}`)

  const result = pageInstance('pages/result/result')
  result.onLoad({ id: record.id })
  assert.equal(result.data.loadFailed, false)
  assert.equal(result.data.representatives.length, 6)
  assert.deepEqual(result.onShareAppMessage(), home.onShareAppMessage())
  assert.equal(result.data.reportUrl, `/pages/report/report?id=${record.id}`)
  result.openReport()
  assert.equal(navigation.pop(), result.data.reportUrl)

  const report = pageInstance('pages/report/report')
  report.onLoad({ id: record.id })
  assert.equal(report.data.report.plan.label, '学生路线')
  assert.equal(report.data.milestones.length, 3)
  report.selectHorizon(event({ horizon: '180' }))
  report.saveReport()
  const again = pageInstance('pages/report/report')
  again.onLoad({ id: record.id })
  assert.equal(again.data.milestones.length, 6)
  assert.deepEqual(again.data.representatives, result.data.representatives)

  const history = pageInstance('pages/history/history')
  history.onShow()
  assert.equal(history.data.records[0].hasSavedReport, true)
  confirm = false
  history.deleteRecord(event({ id: record.id }))
  assert.ok(storage.getSavedReport(record.id))

  const settings = pageInstance('pages/data-settings/data-settings')
  settings.onShow()
  assert.equal(settings.data.recordCount, 1)
  assert.equal(settings.data.reportCount, 1)
  assert.equal(settings.data.drafts.length, 1)
  settings.deleteAll()
  assert.equal(storage.readHistory().length, 1)
  confirm = true
  settings.deleteAll()
  assert.equal(settings.data.hasData, false)
  assert.equal(storage.getRecord(record.id), null)
  assert.equal(storage.getSavedReport(record.id), null)
  assert.equal(storage.getDraft(worker), null)
})

test('页面路由均已注册，索引仅开放公开页面', () => {
  const root = path.join(__dirname, '..')
  const sitemap = require(path.join(root, sitemapLocation))
  const publicPages = ['pages/index/index', 'pages/knowledge/knowledge', 'pages/about/about']
  assert.deepEqual(sitemap.rules, [
    ...publicPages.map((page) => ({ action: 'allow', page })),
    { action: 'disallow', page: '*' }
  ])
  for (const page of pages) {
    for (const extension of ['js', 'wxml']) {
      const filename = path.join(root, `${page}.${extension}`)
      const text = fs.readFileSync(filename, 'utf8')
      const routes = text.matchAll(/\/(pages\/[a-z-]+\/[a-z-]+)(?=[?'"`])/g)
      for (const [, route] of routes) assert.ok(pages.includes(route), `${page} → ${route}`)
    }
  }
})

test('体验版运行代码无网络请求、身份采集或真实商业调用', () => {
  const root = path.join(__dirname, '..')
  const files = ['app.js', ...['pages', 'components', 'services', 'utils'].flatMap((directory) =>
    fs.readdirSync(path.join(root, directory), { recursive: true })
      .filter((name) => /\.(js|wxml)$/.test(name))
      .map((name) => path.join(directory, name))
  )]
  for (const file of files) {
    const contents = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(contents, /\bwx\s*\.\s*(?:request|uploadFile|connectSocket|login|getUserProfile|getUserInfo|requestPayment|create\w*Ad)\s*\(/, file)
    assert.doesNotMatch(contents, /open-type\s*=\s*["'](?:getPhoneNumber|getUserInfo)["']/, file)
  }
})

test('发布配置检查区分体验 AppID、受保护文件和可读配置', () => {
  assert.match(checkProjectConfig('{"appid":"touristappid","compileType":"miniprogram"}')[0], /正式小程序 AppID/)
  assert.match(checkProjectConfig('{"appid":"placeholder","compileType":"miniprogram"}')[0], /格式/)
  assert.match(checkProjectConfig('%TSD-Header-test')[0], /受保护格式/)
  assert.match(checkProjectConfig('not JSON')[0], /JSON/)
  assert.deepEqual(checkProjectConfig('{"appid":"wx0123456789abcdef","compileType":"miniprogram"}'), [])
})
