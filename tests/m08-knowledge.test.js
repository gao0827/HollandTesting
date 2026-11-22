const test = require('node:test')
const assert = require('node:assert/strict')
const { FEATURE_FLAGS } = require('../config/product')
const { listDimensions, listCareers, getCareer, listCases, getCase } = require('../services/knowledge-service')

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

test('六种兴趣均有带公开来源与许可的职业及岗位示例', () => {
  assert.equal(FEATURE_FLAGS.knowledgeBase, true)
  const careers = listCareers()
  assert.equal(new Set(careers.map((career) => career.id)).size, careers.length)
  for (const { code } of listDimensions()) {
    const examples = listCareers(code)
    assert.ok(examples.length, code)
    for (const career of examples) {
      assert.equal(career.dimension, code)
      assert.equal(getCareer(career.id), career)
      assert.ok(career.roles.length)
      assert.ok(career.tasks.length)
      assert.match(career.source.url, /^https:\/\/www\.onetonline\.org\//)
      assert.ok(career.source.licenseUrl)
    }
  }
})

test('从测评结果带入兴趣筛选，切换全部可恢复完整列表', () => {
  const page = loadPage('knowledge')
  page.onLoad({ type: 'A' })
  assert.equal(page.data.selectedType.code, 'A')
  assert.deepEqual(page.data.careers, listCareers('A'))
  page.selectType({ currentTarget: { dataset: { code: '' } } })
  assert.equal(page.data.selectedType, null)
  assert.deepEqual(page.data.careers, listCareers())
  page.onLoad({ type: 'constructor' })
  assert.equal(page.data.selectedType, null)
  assert.deepEqual(page.data.careers, listCareers())
  assert.deepEqual(page.data.cases, listCases())
})

test('详情页按 ID 加载与复制来源，未知 ID 保留空状态', () => {
  const copied = []
  global.wx = { setClipboardData: ({ data }) => copied.push(data) }
  try {
    const careerPage = loadPage('career-detail')
    careerPage.onLoad({ id: 'unknown' })
    careerPage.copySource()
    assert.equal(careerPage.data.career, null)
    careerPage.onLoad({ id: 'data-science' })
    assert.equal(careerPage.data.type.code, 'I')
    assert.equal(careerPage.data.rolesText, '数据科学家')
    careerPage.copySource()

    const casePage = loadPage('case-detail')
    casePage.onLoad()
    casePage.copySource()
    assert.equal(casePage.data.entry, null)
    casePage.onLoad({ id: 'tu-youyou' })
    casePage.copySource()

    assert.deepEqual(copied, [getCareer('data-science').source.url, getCase('tu-youyou').source.url])
    assert.ok(listCases().every((entry) => entry.source.usage && entry.source.url.startsWith('https://')))
    assert.ok(listCases().every((entry) => !('dimension' in entry) && !('code' in entry)))
  } finally {
    delete global.wx
  }
})
