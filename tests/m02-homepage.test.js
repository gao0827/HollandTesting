const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const standardQuestionnaire = require(path.join(ROOT, 'data/questionnaire-standard'))

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('首页注册两个 M02 原生组件', () => {
  const pageConfig = JSON.parse(read('pages/index/index.json'))
  assert.deepEqual(pageConfig.usingComponents, {
    'holland-hexagon': '/components/holland-hexagon/holland-hexagon',
    'career-explorer-illustration': '/components/career-explorer-illustration/career-explorer-illustration'
  })
})

test('M02 组件均具备原生组件四件套', () => {
  const components = ['holland-hexagon', 'career-explorer-illustration']
  components.forEach((name) => {
    const base = path.join(ROOT, 'components', name, name)
    ;['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
      assert.equal(fs.existsSync(`${base}${extension}`), true, `${name}${extension}`)
    })
    assert.equal(JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')).component, true)
  })
})

test('首页包含品牌、霍兰德六边形、原创职业探索插画和测评入口', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /职趣测评/)
  assert.match(wxml, /<holland-hexagon/)
  assert.match(wxml, /<career-explorer-illustration/)
  assert.match(wxml, /bindtap="startAssessment"/)
  assert.match(wxml, /标准版/)
  assert.match(wxml, /专业版/)
  assert.match(wxml, /bindtap="openProfessionalAssessment"/)
})

test('首页完整展示六种 RIASEC 类型', () => {
  const pageScript = read('pages/index/index.js')
  ;['现实型', '研究型', '艺术型', '社会型', '企业型', '常规型'].forEach((name) => {
    assert.match(pageScript, new RegExp(name))
  })
})

test('首页明确标注当前题目为自编体验题', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /自编体验题/)
  assert.match(wxml, /不是官方职业量表/)
})

test('M02 插画不依赖外部图片或远程地址', () => {
  const files = [
    read('pages/index/index.wxml'),
    read('components/holland-hexagon/holland-hexagon.wxml'),
    read('components/career-explorer-illustration/career-explorer-illustration.wxml')
  ].join('\n')
  assert.doesNotMatch(files, /<image\b/)
  assert.doesNotMatch(files, /https?:\/\//)
})

test('首页现有历史、说明和最近结果入口继续保留', () => {
  const script = read('pages/index/index.js')
  assert.match(script, /openHistory/)
  assert.match(script, /openAbout/)
  assert.match(script, /openRecent/)
})

test('专业版入口明确保持未开放且不触发支付', () => {
  const script = read('pages/index/index.js')
  const selectionScript = read('pages/selection/selection.js')
  const wxml = read('pages/index/index.wxml')
  assert.match(script, /assessmentType=professional/)
  assert.match(selectionScript, /专业版正在筹备中/)
  assert.match(selectionScript, /不会产生支付或解锁结果/)
  assert.match(wxml, /规划中/)
  assert.doesNotMatch(script, /requestPayment/)
  assert.doesNotMatch(selectionScript, /requestPayment/)
})

test('两个入口展示真实可用题量并区分当前状态', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /<text>{{standardQuestionCount}}<\/text><text class="count-unit">题<\/text>/)
  assert.match(wxml, /<text>250<\/text><text class="count-unit">题<\/text>/)
  assert.match(wxml, /已开放/)
  assert.match(wxml, /规划中/)
  assert.equal(standardQuestionnaire.item_count, 60)
  assert.doesNotMatch(wxml, /标准体验版/)
  assert.doesNotMatch(wxml, /当前\s*48\s*题/)
})

test('版本参考文案不冒充官方量表或复制授权内容', () => {
  const wxml = read('pages/index/index.wxml')
  const script = read('pages/selection/selection.js')
  assert.match(wxml, /当前题目为自编体验题/)
  assert.match(script, /不复制 SDS® 等受版权保护内容/)
})

test('两个版本入口采用并排简约布局', () => {
  const wxml = read('pages/index/index.wxml')
  const wxss = read('pages/index/index.wxss')
  const theme = read('pages/index/index-academy.wxss')
  assert.match(wxss, /\.assessment-entries[\s\S]*grid-template-columns:\s*repeat\(2, 1fr\)/)
  assert.match(theme, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(theme, /\.academy-theme \.assessment-entry[\s\S]*min-height:\s*176rpx/)
  assert.match(theme, /\.academy-theme \.assessment-entry[\s\S]*width:\s*100%/)
  assert.match(theme, /\.academy-theme \.assessment-entry[\s\S]*min-width:\s*0/)
  assert.match(theme, /\.academy-theme \.standard-entry[\s\S]*#fffdf8/)
  assert.match(theme, /\.academy-theme \.professional-entry[\s\S]*#ac4938/)
  assert.doesNotMatch(wxml, /class="version-note"/)
  assert.doesNotMatch(wxml, /class="hero-facts"/)
})

test('两个入口具备三维按压反馈', () => {
  const wxml = read('pages/index/index.wxml')
  const wxss = read('pages/index/index-academy.wxss')
  assert.equal((wxml.match(/hover-class="entry-pressed"/g) || []).length, 2)
  assert.match(wxss, /\.academy-theme \.standard-entry[\s\S]*box-shadow:\s*0 10rpx 0/)
  assert.match(wxss, /\.academy-theme \.professional-entry[\s\S]*box-shadow:\s*0 10rpx 0/)
  assert.match(wxss, /\.academy-theme \.standard-entry\.entry-pressed/)
  assert.match(wxss, /transform:\s*translateY\(7rpx\)/)
})

test('首页使用已确认的广告语', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /看见你的热爱/)
  assert.match(wxml, /遇见未来的方向/)
})

test('封面原创插画包含东方书院文化图形', () => {
  const wxml = read('components/career-explorer-illustration/career-explorer-illustration.wxml')
  assert.match(wxml, /window-lattice/)
  assert.match(wxml, /academy-mountain/)
  assert.match(wxml, /mountain-path/)
  assert.match(wxml, /academy-pavilion/)
  assert.match(wxml, /culture-scroll/)
  assert.match(wxml, /culture-book/)
  assert.match(wxml, /culture-spark/)
  assert.match(wxml, /mini-compass/)
})

test('首页启用东方书院主题且不依赖位图素材', () => {
  const pageWxml = read('pages/index/index.wxml')
  const pageWxss = read('pages/index/index.wxss')
  const themeWxss = read('pages/index/index-academy.wxss')
  assert.match(pageWxml, /academy-theme/)
  assert.match(pageWxml, /hero-lattice/)
  assert.match(pageWxss, /@import "\.\/index-academy\.wxss"/)
  assert.match(themeWxss, /东方书院/)
  assert.match(themeWxss, /#fffaf0/i)
  assert.match(themeWxss, /#a43d2e/i)
  assert.doesNotMatch(themeWxss, /https?:\/\//)
})

test('首页两个版本入口进入测评选择页并携带版本参数', () => {
  let pageDefinition = null
  const navigateTargets = []
  global.Page = (definition) => {
    pageDefinition = definition
  }
  global.wx = {
    navigateTo(options) {
      navigateTargets.push(options.url)
    }
  }

  const pagePath = path.join(ROOT, 'pages/index/index.js')
  delete require.cache[require.resolve(pagePath)]
  require(pagePath)

  pageDefinition.startAssessment()
  pageDefinition.openProfessionalAssessment()

  assert.deepEqual(navigateTargets, [
    '/pages/selection/selection?assessmentType=standard',
    '/pages/selection/selection?assessmentType=professional'
  ])
})
