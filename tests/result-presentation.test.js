const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const cases = require('../data/knowledge/cases')
const { getTypeRepresentatives } = require('../services/knowledge-service')

function chart(dimensions) {
  const componentPath = require.resolve('../components/interest-chart/interest-chart')
  let definition
  global.Component = (value) => { definition = value }
  try {
    delete require.cache[componentPath]
    require(componentPath)
  } finally {
    delete global.Component
  }
  const state = {}
  definition.observers.dimensions.call({ setData: (values) => Object.assign(state, values) }, dimensions)
  return state
}

test('六维图保留零百分比、跳过缺失百分比，并解释最高分并列', () => {
  const view = chart([
    { code: 'R', name: '现实型', rawScore: 42, percentage: 80 },
    { code: 'I', name: '研究型', rawScore: 42, percentage: null },
    { code: 'A', name: '艺术型', rawScore: 10, percentage: 0 }
  ])
  assert.deepEqual(view.rows.map((row) => row.hasPercentage), [true, false, true])
  assert.equal(view.hasCompass, false)
  assert.deepEqual(view.points, [])
  assert.match(view.description, /现实型、研究型并列得分最高（42 分）/)
  assert.equal(chart([{ name: '现实型', rawScore: 10 }]).hasCompass, false)
  assert.match(chart([{ rawScore: 30 }, { rawScore: 30 }]).description, /均为 30 分/)
})

test('罗盘固定 RIASEC 轴顺序，0% 落在中心、100% 落在外圈', () => {
  const view = chart('CSREIA'.split('').map((code) => ({
    code,
    rawScore: 30,
    percentage: code === 'R' ? 100 : 0
  })))
  assert.equal(view.hasCompass, true)
  assert.equal(view.axes.map(({ code }) => code).join(''), 'RIASEC')
  assert.equal(view.points[0].style, 'left:50%;top:14%')
  assert.equal(view.points[1].style, 'left:50%;top:50%')
  assert.equal(view.outline.length, 6)
})

test('每个人物案例关联独立的本地头像', () => {
  assert.equal(new Set(cases.map((entry) => entry.avatar)).size, cases.length)
  for (const { avatar } of cases) {
    assert.match(avatar, /^\/assets\/portraits\/[a-z-]+\.png$/)
    const png = fs.readFileSync(path.join(__dirname, '..', avatar.slice(1)))
    assert.equal(png.toString('ascii', 1, 4), 'PNG')
    assert.equal(png.readUInt32BE(16), 256)
    assert.equal(png.readUInt32BE(20), 256)
  }
})

test('六维得分各关联一位人物，并按分数和固定同分顺序展示', () => {
  const dimensions = [
    { code: 'C', rawScore: 20 }, { code: 'E', rawScore: 50 }, { code: 'A', rawScore: 35 },
    { code: 'S', rawScore: 35 }, { code: 'I', rawScore: 45 }, { code: 'R', rawScore: 25 }
  ]
  const examples = getTypeRepresentatives(dimensions)
  assert.deepEqual(examples.map((entry) => entry.id), [
    'estee-lauder', 'tu-youyou', 'hayao-miyazaki',
    'maria-montessori', 'temple-grandin', 'florence-nightingale'
  ])
  assert.ok(examples.every((entry) => entry.avatar && entry.relevance))
  assert.deepEqual(getTypeRepresentatives([{ code: 'I', rawScore: 40 }]).map((entry) => entry.id), ['tu-youyou'])
})
