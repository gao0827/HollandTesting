const { createServer } = require('node:http')
const { createCheckout, makeStore } = require('./report-checkout')
const { createWechatPay, createWechatPush } = require('./wechat-pay')
const { professionalReportPriceFen } = require('../config/commercial')

const PREFIX = '/professional-report'
const REPORT_OPERATIONS = new Set(['status', 'order', 'report'])
const BODY_LIMIT = 32 * 1024

function readConfig(env) {
  const config = {
    appId: env.HOLLAND_WECHAT_APP_ID,
    appSecret: env.HOLLAND_WECHAT_APP_SECRET,
    offerId: env.HOLLAND_WECHAT_OFFER_ID,
    appKey: env.HOLLAND_WECHAT_PAY_KEY,
    productId: env.HOLLAND_WECHAT_PRODUCT_ID,
    pushToken: env.HOLLAND_WECHAT_PUSH_TOKEN,
    encodingAesKey: env.HOLLAND_WECHAT_PUSH_AES_KEY,
    priceFen: Number(env.HOLLAND_REPORT_PRICE_FEN ?? professionalReportPriceFen),
    env: Number(env.HOLLAND_WECHAT_PAY_ENV ?? 0),
    dbPath: env.HOLLAND_REPORT_DB_PATH
  }
  if (!/^wx[a-z0-9]{16}$/i.test(config.appId || '') ||
      ![config.appSecret, config.offerId, config.appKey, config.productId, config.pushToken, config.dbPath].every(Boolean) ||
      !/^[a-zA-Z0-9+/]{43}$/.test(config.encodingAesKey || '') ||
      !Number.isSafeInteger(config.priceFen) || config.priceFen <= 0 || ![0, 1].includes(config.env)) {
    throw new Error('报告服务配置不完整。请检查服务端环境变量。')
  }
  return config
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('请求内容过大')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function createHttpServer(checkout, push, config) {
  return createServer({ requestTimeout: 15000 }, async (req, res) => {
    const send = (status, body, contentType = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
      res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body)
    }
    try {
      const { pathname, searchParams } = new URL(req.url, 'http://localhost')
      if (pathname === `${PREFIX}/health` && config) {
        if (req.method !== 'GET') return send(405, { error: '请求方式不支持' })
        return send(200, {
          service: 'holland-report-payment', appId: config.appId, paymentEnv: config.env, priceFen: config.priceFen
        })
      }
      if (pathname === `${PREFIX}/notify`) {
        if (req.method === 'GET') {
          const challenge = searchParams.get('echostr')
          if (!challenge || !push.verifyChallenge(searchParams)) return send(403, { error: '推送校验失败' })
          return send(200, challenge, 'text/plain; charset=utf-8')
        }
        if (req.method !== 'POST') return send(405, { error: '请求方式不支持' })
        let event
        try {
          event = push.readEvent(searchParams, await readBody(req))
        } catch {
          return send(403, { error: '推送验签失败' })
        }
        await checkout.receiveDelivery(event)
        return send(200, 'success', 'text/plain; charset=utf-8')
      }
      const operation = pathname.slice(PREFIX.length + 1)
      if (!pathname.startsWith(`${PREFIX}/`) || !REPORT_OPERATIONS.has(operation)) {
        return send(404, { error: '接口不存在' })
      }
      if (req.method !== 'POST') return send(405, { error: '请求方式不支持' })
      let input
      try {
        input = await readBody(req)
      } catch {
        return send(400, { error: '请求格式无效' })
      }
      const { httpStatus = 200, ...result } = await checkout.handle(operation, input)
      return send(httpStatus, result)
    } catch {
      return send(503, { error: '报告服务暂时不可用' })
    }
  })
}

if (require.main === module) {
  const config = readConfig(process.env)
  const port = Number(process.env.HOLLAND_REPORT_PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('报告服务监听端口无效')
  const store = makeStore(config.dbPath)
  const checkout = createCheckout(config, createWechatPay(config), store)
  const server = createHttpServer(checkout, createWechatPush(config), config)
  server.listen(port, process.env.HOLLAND_REPORT_HOST || '127.0.0.1', () => {
    console.log(`报告服务已监听端口 ${port}`)
  })
}

module.exports = { readConfig, createHttpServer }
