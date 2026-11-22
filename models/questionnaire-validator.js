const { DIMENSION_ORDER } = require('../data/riasec')

const REQUIRED_ITEM_FIELDS = Object.freeze([
  'id',
  'questionnaire_id',
  'questionnaire_version',
  'schema_version',
  'order',
  'dimension',
  'text',
  'options',
  'reverse_scored',
  'scoring',
  'source'
])

const REQUIRED_SOURCE_FIELDS = Object.freeze([
  'origin',
  'author',
  'reference_framework',
  'authorization_status',
  'verification_status',
  'official_instrument'
])

function addError(errors, code, message, itemId = '') {
  errors.push({ code, message, item_id: itemId })
}

function validateOptions(metadata, item, errors) {
  if (!Array.isArray(item.options)) {
    addError(errors, 'INVALID_OPTIONS', '题目选项必须为数组', item.id)
    return
  }

  const expectedOptions = metadata.response_options || []
  if (item.options.length !== expectedOptions.length) {
    addError(errors, 'OPTION_COUNT_MISMATCH', '题目选项数量与问卷元数据不一致', item.id)
    return
  }

  item.options.forEach((option, index) => {
    const expected = expectedOptions[index]
    if (!expected || option.value !== expected.value || option.label !== expected.label) {
      addError(errors, 'OPTION_VALUE_MISMATCH', '题目选项值或文案与问卷元数据不一致', item.id)
    }
  })
}

function validateScoring(metadata, item, errors) {
  if (!item.scoring || typeof item.scoring !== 'object') {
    addError(errors, 'INVALID_SCORING', '题目缺少计分规则', item.id)
    return
  }

  const expectedDirection = item.reverse_scored ? 'reverse' : 'forward'
  const expectedRule = metadata.scoring_rules && metadata.scoring_rules[expectedDirection]
  if (item.scoring.direction !== expectedDirection) {
    addError(errors, 'SCORING_DIRECTION_MISMATCH', '计分方向与反向题标记不一致', item.id)
  }
  if (!expectedRule || item.scoring.rule !== expectedRule.rule) {
    addError(errors, 'SCORING_RULE_MISMATCH', '题目计分规则与问卷版本不一致', item.id)
    return
  }

  const values = (metadata.response_options || []).map((option) => option.value)
  values.forEach((value) => {
    if (Number(item.scoring.score_map[value]) !== Number(expectedRule.score_map[value])) {
      addError(errors, 'SCORE_MAP_MISMATCH', '题目分值映射与问卷版本不一致', item.id)
    }
  })
}

function validateSource(item, errors) {
  if (!item.source || typeof item.source !== 'object') {
    addError(errors, 'INVALID_SOURCE', '题目缺少来源声明', item.id)
    return
  }

  REQUIRED_SOURCE_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(item.source, field)) {
      addError(errors, 'MISSING_SOURCE_FIELD', `题目来源缺少字段 ${field}`, item.id)
    }
  })
}

function validateQuestionnaire(metadata, items) {
  const errors = []
  const ids = new Set()
  const dimensionCounts = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, 0]))
  let reverseItemCount = 0

  if (!metadata || typeof metadata !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_METADATA', message: '问卷元数据无效', item_id: '' }],
      stats: { itemCount: 0, reverseItemCount: 0, dimensionCounts }
    }
  }

  if (!Array.isArray(items)) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_ITEMS', message: '题目集合必须为数组', item_id: '' }],
      stats: { itemCount: 0, reverseItemCount: 0, dimensionCounts }
    }
  }

  items.forEach((item, index) => {
    const itemId = item && item.id ? item.id : `index:${index}`
    if (!item || typeof item !== 'object') {
      addError(errors, 'INVALID_ITEM', '题目必须为对象', itemId)
      return
    }

    REQUIRED_ITEM_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(item, field)) {
        addError(errors, 'MISSING_ITEM_FIELD', `题目缺少字段 ${field}`, itemId)
      }
    })

    if (!/^q\d{2,}$/.test(item.id || '')) {
      addError(errors, 'INVALID_ITEM_ID', '题目 ID 必须符合 q01 格式', itemId)
    }
    if (ids.has(item.id)) {
      addError(errors, 'DUPLICATE_ITEM_ID', '题目 ID 重复', itemId)
    }
    ids.add(item.id)

    if (item.questionnaire_id !== metadata.questionnaire_id) {
      addError(errors, 'QUESTIONNAIRE_ID_MISMATCH', '题目 questionnaire_id 不一致', itemId)
    }
    if (item.questionnaire_version !== metadata.questionnaire_version) {
      addError(errors, 'QUESTIONNAIRE_VERSION_MISMATCH', '题目版本与问卷版本不一致', itemId)
    }
    if (item.schema_version !== metadata.question_schema_version) {
      addError(errors, 'SCHEMA_VERSION_MISMATCH', '题目结构版本不一致', itemId)
    }
    if (item.order !== index + 1) {
      addError(errors, 'ITEM_ORDER_MISMATCH', '题目顺序号必须连续', itemId)
    }
    if (!DIMENSION_ORDER.includes(item.dimension)) {
      addError(errors, 'INVALID_DIMENSION', '题目维度必须属于 RIASEC', itemId)
    } else {
      dimensionCounts[item.dimension] += 1
    }
    if (!item.text || typeof item.text !== 'string' || !item.text.trim()) {
      addError(errors, 'INVALID_TEXT', '题目文案不能为空', itemId)
    }
    if (typeof item.reverse_scored !== 'boolean') {
      addError(errors, 'INVALID_REVERSE_FLAG', 'reverse_scored 必须为布尔值', itemId)
    } else if (item.reverse_scored) {
      reverseItemCount += 1
    }

    validateOptions(metadata, item, errors)
    validateScoring(metadata, item, errors)
    validateSource(item, errors)
  })

  if (items.length !== metadata.item_count) {
    addError(errors, 'ITEM_COUNT_MISMATCH', '实际题量与问卷元数据不一致')
  }
  DIMENSION_ORDER.forEach((code) => {
    if (dimensionCounts[code] !== metadata.items_per_dimension) {
      addError(errors, 'DIMENSION_COUNT_MISMATCH', `${code} 维度题量不一致`)
    }
  })
  if (reverseItemCount !== metadata.reverse_item_count) {
    addError(errors, 'REVERSE_COUNT_MISMATCH', '反向题数量与问卷元数据不一致')
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      itemCount: items.length,
      reverseItemCount,
      dimensionCounts
    }
  }
}

module.exports = {
  REQUIRED_ITEM_FIELDS,
  REQUIRED_SOURCE_FIELDS,
  validateQuestionnaire
}
