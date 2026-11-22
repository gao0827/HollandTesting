const fs = require('node:fs')
const path = require('node:path')
const { FEATURE_FLAGS } = require('../config/product')
const { available, getReportAdUnit, getBasicReportAdUnit } = require('../services/commercial-service')

function checkProjectConfig(text) {
  let config
  try {
    config = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return text.startsWith('%TSD-Header')
      ? ['项目配置以受保护格式呈现，命令行无法核验 AppID。请在微信开发者工具中核验项目配置。']
      : ['project.config.json 无法解析为 JSON。']
  }

  const issues = []
  if (typeof config?.appid !== 'string' || !config.appid.trim() || config.appid === 'touristappid') {
    issues.push('项目尚未配置正式小程序 AppID。')
  } else if (!/^wx[0-9a-z]{16}$/i.test(config.appid)) {
    issues.push('AppID 格式无法识别，请核对微信公众平台中的项目配置。')
  }
  if (config?.compileType !== 'miniprogram') issues.push('项目编译类型应为 miniprogram。')
  return issues
}

function checkRelease(root) {
  const issues = []
  try {
    const config = fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')
    issues.push(...checkProjectConfig(config))
  } catch (error) {
    issues.push(`无法读取 project.config.json（${error.code || '读取错误'}）。`)
  }

  if (FEATURE_FLAGS.advertising && !getReportAdUnit({ assessment_type: 'standard' }) &&
      !getBasicReportAdUnit({ assessment_type: 'professional' })) {
    issues.push('开启广告前请配置报告广告单元 ID。')
  }
  if ((FEATURE_FLAGS.payments || FEATURE_FLAGS.paidReportUnlock) && !available) {
    issues.push('开启付费报告前请配置 HTTPS 服务，并同时启用支付和付费解锁。')
  }
  return issues
}

if (require.main === module) {
  const issues = checkRelease(path.resolve(__dirname, '..'))
  if (issues.length) {
    issues.forEach((issue) => console.error(issue))
    process.exitCode = 1
  } else {
    console.log('本地项目配置检查通过。真机、账号权限与平台审核由发布清单核验。')
  }
}

module.exports = { checkProjectConfig }
