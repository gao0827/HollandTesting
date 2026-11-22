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

test('首页六种 RIASEC 类型均提供本地配图、通俗解释和职业示例', () => {
  const { DIMENSION_ORDER, RIASEC } = require('../data/riasec')
  assert.deepEqual(DIMENSION_ORDER.map((code) => RIASEC[code].name), [
    '现实型', '研究型', '艺术型', '社会型', '企业型', '常规型'
  ])
  for (const code of DIMENSION_ORDER) {
    const type = RIASEC[code]
    assert.ok(type.englishName && type.activitySummary && type.exploration)
    const image = fs.readFileSync(path.join(ROOT, type.illustration.slice(1)))
    assert.equal(image.readUInt16BE(0), 0xffd8)
  }
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /wx:for="{{typeCards}}"/)
  assert.match(wxml, /is="interestTypeDefinition"/)
  assert.match(wxml, /bindtap="openInterestType"/)
})

test('首页明确标注当前题目为自编体验题', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /自编体验题/)
  assert.match(wxml, /不是官方职业量表/)
})

test('首页插画使用本地资源，不依赖远程地址', () => {
  const files = [
    read('pages/index/index.wxml'),
    read('components/holland-hexagon/holland-hexagon.wxml'),
    read('components/career-explorer-illustration/career-explorer-illustration.wxml')
  ].join('\n')
  assert.match(files, /src="\/assets\/home\/career-decision\.jpg"/)
  assert.doesNotMatch(files, /https?:\/\//)
})

test('首页现有历史、说明和最近结果入口继续保留', () => {
  const script = read('pages/index/index.js')
  assert.match(script, /openHistory/)
  assert.match(script, /openAbout/)
  assert.match(script, /openRecent/)
})

test('专业版入口已开放且不触发支付', () => {
  const script = read('pages/index/index.js')
  const selectionScript = read('pages/selection/selection.js')
  const wxml = read('pages/index/index.wxml')
  assert.match(selectionScript, /技能自评/)
  assert.match(wxml, /professionalAvailable \? '已开放'/)
  assert.doesNotMatch(script, /requestPayment/)
  assert.doesNotMatch(selectionScript, /requestPayment/)
})

test('两个入口展示真实可用题量并区分当前状态', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /<text>{{standardQuestionCount}}<\/text><text class="count-unit">题<\/text>/)
  assert.match(wxml, /<text>{{professionalQuestionCount}}<\/text><text class="count-unit">题<\/text>/)
  assert.match(wxml, /已开放/)
  assert.equal(require('../data/questionnaire-professional').questionnaire.item_count, 250)
  assert.equal(standardQuestionnaire.item_count, 60)
  assert.doesNotMatch(wxml, /标准体验版/)
  assert.doesNotMatch(wxml, /当前\s*48\s*题/)
})

test('版本参考文案不冒充官方量表或复制授权内容', () => {
  const wxml = read('pages/index/index.wxml')
  const { questionnaire } = require('../data/questionnaire-professional')
  assert.match(wxml, /当前题目为自编体验题/)
  assert.equal(questionnaire.official_instrument, false)
  assert.match(questionnaire.notice, /未经正式信效度验证/)
})

test('两个版本入口采用并排简约布局', () => {
  const wxml = read('pages/index/index.wxml')
  const wxss = read('pages/index/index.wxss')
  const theme = read('pages/index/index-theme.wxss')
  assert.match(wxss, /\.assessment-entries[\s\S]*grid-template-columns:\s*repeat\(2, 1fr\)/)
  assert.match(theme, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(theme, /\.home-theme \.assessment-entry[\s\S]*min-height:\s*176rpx/)
  assert.match(theme, /\.home-theme \.assessment-entry[\s\S]*width:\s*100%/)
  assert.match(theme, /\.home-theme \.assessment-entry[\s\S]*min-width:\s*0/)
  assert.match(theme, /\.home-theme \.standard-entry\s*\{[^}]*background:\s*var\(--color-surface\)/)
  assert.match(theme, /\.home-theme \.professional-entry\s*\{[^}]*background:\s*var\(--color-accent-tint\)/)
  assert.doesNotMatch(wxml, /class="version-note"/)
  assert.doesNotMatch(wxml, /class="hero-facts"/)
})

test('两个入口具备轻微的按压反馈', () => {
  const wxml = read('pages/index/index.wxml')
  const wxss = read('pages/index/index-theme.wxss')
  assert.equal((wxml.match(/hover-class="entry-pressed"/g) || []).length, 2)
  assert.match(wxss, /\.home-theme \.standard-entry\s*\{[^}]*box-shadow:\s*0 3rpx 8rpx/)
  assert.match(wxss, /\.home-theme \.professional-entry\s*\{[^}]*box-shadow:\s*0 3rpx 8rpx/)
  assert.match(wxss, /\.home-theme \.standard-entry\.entry-pressed/)
  assert.match(wxss, /transform:\s*translateY\(2rpx\)/)
})

test('首页封面说明测评的职业探索用途', () => {
  const wxml = read('pages/index/index.wxml')
  assert.match(wxml, /看清职业兴趣/)
  assert.match(wxml, /探索职业方向/)
  assert.match(wxml, /看懂六维兴趣画像，了解值得尝试的职业与下一步行动/)
})

test('封面插画展示职业选择与行动计划，并配有无障碍描述', () => {
  const wxml = read('components/career-explorer-illustration/career-explorer-illustration.wxml')
  assert.match(wxml, /aria-label="[^"]*职业方向[^"]*清单[^"]*下一步/)
  const image = fs.readFileSync(path.join(ROOT, 'assets/home/career-decision.jpg'))
  assert.equal(image.readUInt16BE(0), 0xffd8)
})

test('首页和深度报告共享全局配色与字体', () => {
  const pageWxml = read('pages/index/index.wxml')
  const pageWxss = read('pages/index/index.wxss')
  const themeWxss = read('pages/index/index-theme.wxss')
  const appWxss = read('app.wxss')
  const reportWxss = read('pages/report/report.wxss')
  const appConfig = JSON.parse(read('app.json'))
  const pageConfig = JSON.parse(read('pages/index/index.json'))
  assert.match(pageWxml, /home-theme/)
  assert.match(pageWxml, /hero-lattice/)
  assert.match(pageWxss, /@import "\.\/index-theme\.wxss"/)
  assert.match(appWxss, /--color-heading:\s*#262350/i)
  assert.match(appWxss, /--color-surface:\s*#fffefa/i)
  assert.match(appWxss, /font-family:.*PingFang SC.*sans-serif/)
  assert.match(themeWxss, /\.hero-card\s*\{[^}]*background:\s*var\(--color-heading\)/)
  assert.match(reportWxss, /\.report-hero\s*\{[^}]*background:\s*var\(--color-heading\)/)
  assert.doesNotMatch(themeWxss, /font-family/)
  assert.equal(appConfig.window.navigationBarBackgroundColor, '#F7F8FC')
  assert.equal(pageConfig.navigationBarBackgroundColor, undefined)
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
