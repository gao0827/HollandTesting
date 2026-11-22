const RESPONSE_OPTIONS = Object.freeze([
  Object.freeze({ value: 1, label: '完全不喜欢' }),
  Object.freeze({ value: 2, label: '不太喜欢' }),
  Object.freeze({ value: 3, label: '不确定' }),
  Object.freeze({ value: 4, label: '比较喜欢' }),
  Object.freeze({ value: 5, label: '非常喜欢' })
])

const ITEM_SOURCE = Object.freeze({
  origin: 'self_authored',
  author: '职趣测评项目',
  reference_framework: 'Holland RIASEC',
  authorization_status: 'original_project_content',
  verification_status: 'prototype_internal_review',
  official_instrument: false
})

const FORWARD_SCORE_MAP = Object.freeze({
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5
})

const REVERSE_SCORE_MAP = Object.freeze({
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1
})

module.exports = Object.freeze({
  questionnaire_id: 'career-interest-standard',
  questionnaire_version: '0.3.0-prototype',
  question_schema_version: '1.0.0',
  scoring_version: 'riasec-sum-1.0.0',
  assessment_type: 'standard',
  item_count: 60,
  items_per_dimension: 10,
  reverse_item_count: 0,
  dimension_order: Object.freeze(['R', 'I', 'A', 'S', 'E', 'C']),
  response_scale: Object.freeze({
    min: 1,
    max: 5
  }),
  response_options: RESPONSE_OPTIONS,
  scoring_rules: Object.freeze({
    forward: Object.freeze({
      rule: 'likert_direct',
      score_map: FORWARD_SCORE_MAP
    }),
    reverse: Object.freeze({
      rule: 'likert_reverse',
      score_map: REVERSE_SCORE_MAP
    })
  }),
  item_source: ITEM_SOURCE,
  content_status: 'self_authored_prototype',
  validation_status: 'not_formally_validated',
  official_instrument: false,
  notice: '本题库为项目自编职业兴趣体验题，不是 O*NET®、SDS® 或其他官方量表的中文版本。'
})
