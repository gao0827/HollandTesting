const { FEATURE_FLAGS } = require('../config/product')

function reserveOperation(operation, feature) {
  return async function unavailable() {
    const enabled = FEATURE_FLAGS[feature]
    const error = new Error(enabled ? '商业服务尚未接入' : '商业功能尚未开放')
    error.code = enabled ? 'COMMERCIAL_PROVIDER_MISSING' : 'COMMERCIAL_DISABLED'
    error.operation = operation
    throw error
  }
}

module.exports = {
  showAd: reserveOperation('showAd', 'advertising'),
  createOrder: reserveOperation('createOrder', 'payments'),
  startPayment: reserveOperation('startPayment', 'payments'),
  verifyOrder: reserveOperation('verifyOrder', 'payments'),
  unlockReport: reserveOperation('unlockReport', 'paidReportUnlock'),
  requestRefund: reserveOperation('requestRefund', 'payments')
}
