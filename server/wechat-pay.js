const { createHash, createHmac, createDecipheriv, timingSafeEqual } = require('node:crypto')

const API = 'https://api.weixin.qq.com'

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function equalText(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function createWechatPay(config, request = fetch) {
  let accessToken
  let refreshInFlight

  async function call(route, params, body) {
    const url = new URL(route, API)
    url.search = new URLSearchParams(params).toString()
    const response = await request(url, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body, headers: { 'Content-Type': 'application/json' } }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error'
    })
    if (!response.ok) throw new Error('微信服务暂时不可用')
    const data = await response.json()
    if (data.errcode !== undefined && data.errcode !== 0) throw new Error('微信未确认本次操作')
    return data
  }

  async function login(code) {
    const data = await call('/sns/jscode2session', {
      appid: config.appId, secret: config.appSecret, js_code: code, grant_type: 'authorization_code'
    })
    if (!data.openid || !data.session_key) throw new Error('未取得微信会话')
    return { openid: data.openid, sessionKey: data.session_key }
  }

  async function getAccessToken() {
    if (accessToken?.expiresAt > Date.now()) return accessToken.value
    if (!refreshInFlight) {
      const params = JSON.stringify({
        grant_type: 'client_credential', appid: config.appId, secret: config.appSecret
      })
      refreshInFlight = call('/cgi-bin/stable_token', {}, params).then((data) => {
        if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error('未取得微信接口令牌')
        accessToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
        return accessToken.value
      }).finally(() => { refreshInFlight = undefined })
    }
    return refreshInFlight
  }

  async function virtualPay(route, payload) {
    const body = JSON.stringify(payload)
    return call(route, {
      access_token: await getAccessToken(),
      pay_sig: hmac(config.appKey, `${route}&${body}`)
    }, body)
  }

  return {
    login,
    async queryOrder(order) {
      const data = await virtualPay('/xpay/query_order', {
        openid: order.openid, env: order.env, order_id: order.id
      })
      if (data.order?.order_id !== order.id || !Number.isInteger(data.order.status)) {
        throw new Error('未取得匹配的微信订单')
      }
      return data.order
    },
    async confirmDelivery(order) {
      await virtualPay('/xpay/notify_provide_goods', { order_id: order.id, env: order.env })
    },
    signOrder(order, sessionKey) {
      const signData = JSON.stringify({
        offerId: config.offerId,
        buyQuantity: 1,
        env: order.env,
        currencyType: 'CNY',
        productId: order.productId,
        goodsPrice: order.priceFen,
        outTradeNo: order.id
      })
      return {
        mode: 'short_series_goods',
        signData,
        paySig: hmac(config.appKey, `requestVirtualPayment&${signData}`),
        signature: hmac(sessionKey, signData)
      }
    }
  }
}

function createWechatPush({ appId, pushToken, encodingAesKey }) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64')
  if (key.length !== 32) throw new Error('微信消息推送 EncodingAESKey 无效')

  function signatureFor(timestamp, nonce, encrypted) {
    if (!timestamp || !nonce) throw new Error('微信消息推送缺少签名参数')
    const fields = [pushToken, timestamp, nonce]
    if (encrypted !== undefined) fields.push(encrypted)
    return createHash('sha1').update(fields.sort().join('')).digest('hex')
  }

  return {
    verifyChallenge(params) {
      return equalText(params.get('signature'), signatureFor(params.get('timestamp'), params.get('nonce')))
    },
    readEvent(params, body) {
      const encrypted = body?.Encrypt
      if (typeof encrypted !== 'string' || !equalText(params.get('msg_signature'),
        signatureFor(params.get('timestamp'), params.get('nonce'), encrypted))) {
        throw new Error('微信消息签名无效')
      }
      const cipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16)).setAutoPadding(false)
      const decoded = Buffer.concat([cipher.update(Buffer.from(encrypted, 'base64')), cipher.final()])
      const padding = decoded.at(-1)
      if (padding < 1 || padding > 32 || padding > decoded.length ||
          !decoded.subarray(-padding).every((value) => value === padding)) {
        throw new Error('微信消息填充无效')
      }
      const message = decoded.subarray(0, -padding)
      if (message.length < 20) throw new Error('微信消息长度无效')
      const end = 20 + message.readUInt32BE(16)
      if (end > message.length || message.subarray(end).toString('utf8') !== appId) {
        throw new Error('微信消息 AppID 无效')
      }
      return JSON.parse(message.subarray(20, end).toString('utf8'))
    }
  }
}

module.exports = { createWechatPay, createWechatPush }
