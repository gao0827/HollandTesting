const { PRODUCT_CONFIG } = require('../config/product')
const { normalizeStoredRecord } = require('../models/assessment-record')

// 沿用历史记录的键，写入新版数据时同时替换旧格式。
const HISTORY_KEY = 'career_interest_history_v1'
const LEGACY_DRAFT_KEY = 'career_interest_draft_v1'
const LEGACY_DRAFT_ID = 'legacy'
const STORAGE_VERSION = 2

function emptyState() {
  return { version: STORAGE_VERSION, records: [], drafts: [], reports: [] }
}

function isMissing(value) {
  return value === '' || value == null
}

function getDraftId(value) {
  const userType = value?.user_type || value?.userType
  const assessmentType = value?.assessment_type || value?.assessmentType
  return userType && assessmentType ? `${assessmentType}:${userType}` : LEGACY_DRAFT_ID
}

function hasDraftAnswers(draft) {
  return draft?.answers && !Array.isArray(draft.answers) &&
    typeof draft.answers === 'object' && Object.keys(draft.answers).length > 0
}

function readState() {
  const value = wx.getStorageSync(HISTORY_KEY)
  if (value?.version === STORAGE_VERSION && Array.isArray(value.records) &&
      Array.isArray(value.drafts) && Array.isArray(value.reports)) {
    return { state: value, needsMigration: false }
  }
  if (!isMissing(value) && !Array.isArray(value)) {
    throw new Error('无法读取此版本的本地测评数据')
  }
  const legacyDraft = wx.getStorageSync(LEGACY_DRAFT_KEY)
  return {
    state: {
      ...emptyState(),
      records: Array.isArray(value) ? value.map((record) => normalizeStoredRecord(record) || record) : [],
      drafts: hasDraftAnswers(legacyDraft) ? [legacyDraft] : []
    },
    needsMigration: !isMissing(legacyDraft)
  }
}

function readView() {
  try {
    return readState().state
  } catch (error) {
    return emptyState()
  }
}

function updateState(change) {
  const { state, needsMigration } = readState()
  const next = change(state)
  if (needsMigration) wx.setStorageSync(HISTORY_KEY, state)
  // 先确保旧草稿已复制，再清除旧键。清除失败时，下一次操作可继续重试。
  if (needsMigration || !isMissing(wx.getStorageSync(LEGACY_DRAFT_KEY))) {
    wx.removeStorageSync(LEGACY_DRAFT_KEY)
  }
  wx.setStorageSync(HISTORY_KEY, next)
  return next
}

function listRecords(state) {
  return state.records.map(normalizeStoredRecord).filter(Boolean)
}

function readHistory() {
  return listRecords(readView())
}

function getRecord(id) {
  const history = readHistory()
  if (!id) return history[0] || null
  return history.find((item) => item.id === String(id)) || null
}

function saveRecord(record, draftIds = []) {
  const normalized = normalizeStoredRecord(record)
  if (!normalized) throw new Error('测评记录缺少有效的标识或结果')
  updateState((state) => {
    const rest = state.records.filter((item) => String(item?.assessment_id || item?.id) !== normalized.id)
    const records = [normalized, ...rest].slice(0, PRODUCT_CONFIG.maxLocalHistory)
    const keptIds = new Set(records.map((item) => String(item?.assessment_id || item?.id)))
    return {
      ...state,
      records,
      drafts: state.drafts.filter((draft) => !draftIds.includes(getDraftId(draft))),
      reports: state.reports.filter((report) => keptIds.has(report.id))
    }
  })
  return normalized
}

function removeRecord(id) {
  const next = updateState((state) => ({
    ...state,
    records: state.records.filter((record) => String(record?.assessment_id || record?.id) !== String(id)),
    reports: state.reports.filter((report) => report.id !== String(id))
  }))
  return listRecords(next)
}

function unlockBasicReport(id) {
  const next = updateState((state) => {
    const record = listRecords(state).find((item) => item.id === String(id))
    if (!record) throw new Error('对应的测评记录已删除')
    return {
      ...state,
      records: state.records.map((item) => String(item?.assessment_id || item?.id) === record.id
        ? { ...item, basic_report_ad_completed: true }
        : item)
    }
  })
  return listRecords(next).find((item) => item.id === String(id))
}

function clearHistory() {
  updateState((state) => ({ ...state, records: [], reports: [] }))
}

function getDraft(selection) {
  const drafts = readView().drafts.filter(hasDraftAnswers)
  if (!selection) return drafts[0] || null
  const id = getDraftId(selection)
  if ((selection.assessmentType || selection.assessment_type) === 'professional') {
    return drafts.find((draft) => getDraftId(draft) === id && id !== LEGACY_DRAFT_ID) || null
  }
  return drafts.find((draft) => getDraftId(draft) === id) ||
    drafts.find((draft) => getDraftId(draft) === LEGACY_DRAFT_ID) || null
}

function saveDraft(draft, previousId) {
  if (!hasDraftAnswers(draft)) return
  const id = getDraftId(draft)
  updateState((state) => ({
    ...state,
    drafts: [draft, ...state.drafts.filter((item) => {
      const existingId = getDraftId(item)
      return existingId !== id && existingId !== previousId
    })]
  }))
}

function clearDraft(id) {
  updateState((state) => ({
    ...state,
    drafts: state.drafts.filter((draft) => getDraftId(draft) !== id)
  }))
}

function getSavedReport(id) {
  return readView().reports.find((entry) => entry.id === String(id)) || null
}

function saveReport(id, report, horizon) {
  const recordId = String(id)
  const entry = { id: recordId, report, horizon, savedAt: Date.now() }
  updateState((state) => {
    if (!listRecords(state).some((record) => record.id === recordId)) {
      throw new Error('对应的测评记录已删除')
    }
    return { ...state, reports: [entry, ...state.reports.filter((item) => item.id !== recordId)] }
  })
  return entry
}

function removeSavedReport(id) {
  updateState((state) => ({
    ...state,
    reports: state.reports.filter((entry) => entry.id !== String(id))
  }))
}

function getDataSummary() {
  const { state, needsMigration } = readState()
  return {
    recordCount: state.records.length,
    reportIds: state.reports.map((item) => item.id),
    drafts: state.drafts.filter(hasDraftAnswers),
    hasData: Boolean(state.records.length || state.reports.length || state.drafts.length || needsMigration)
  }
}

function clearAllData() {
  updateState(emptyState)
}

module.exports = {
  readHistory,
  saveRecord,
  getRecord,
  removeRecord,
  unlockBasicReport,
  clearHistory,
  getDraftId,
  saveDraft,
  getDraft,
  clearDraft,
  getSavedReport,
  saveReport,
  removeSavedReport,
  getDataSummary,
  clearAllData
}
