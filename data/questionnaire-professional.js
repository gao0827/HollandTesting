const standard = require('./questionnaire-standard')
const interestItems = require('./questions')
const itemGroups = require('./professional-items')
const legacyItemGroups = require('./professional-items-v1')

const questionnaire = Object.freeze({
  ...standard,
  questionnaire_id: 'career-interest-professional',
  questionnaire_version: '1.1.0-prototype',
  scoring_version: 'career-profile-1.1.0',
  assessment_type: 'professional',
  item_count: 250,
  notice: '专业版为项目自编探索工具，尚未经正式信效度验证。技能结果来自自评。'
})

const legacyQuestionnaire = Object.freeze({
  ...questionnaire,
  questionnaire_version: '1.0.0-prototype',
  scoring_version: 'career-profile-1.0.0'
})

const legacySections = [
  { id: 'interest', label: '职业兴趣', count: 60, prompt: '请按真实兴趣作答，而不是按能力或期待作答。' },
  {
    id: 'ability', label: '技能自评', count: 50, prompt: '根据实际经历，你现在完成这项任务的熟练程度如何？',
    labels: ['需要全程指导', '需要较多帮助', '能完成常见任务', '能独立完成', '能处理复杂情况', '未尝试或无法判断'],
    interpretation: '对照练习成果或他人反馈复核熟练程度，优先试做缺少经历的任务。',
    scale: '自评熟练度'
  },
  {
    id: 'career_values', label: '职业价值观', count: 50, prompt: '选择职业时，这个条件对你有多重要？',
    labels: ['几乎不重要', '较不重要', '中等重要', '比较重要', '非常重要'],
    interpretation: '挑出最重视的条件，写成比较岗位时可以核对的具体要求。',
    scale: '自评重要度'
  },
  {
    id: 'environment_preferences', label: '工作环境偏好', count: 45, prompt: '你有多喜欢在这种工作方式下完成任务？',
    labels: ['完全不喜欢', '不太喜欢', '偏好一般', '比较喜欢', '非常喜欢'],
    interpretation: '从岗位说明或访谈中核实日常工作方式，再观察自己能否长期适应。',
    scale: '自评偏好'
  },
  {
    id: 'career_aspirations', label: '职业愿望', count: 45, prompt: '未来几年，你有多愿意尝试这个方向？',
    labels: ['完全不愿意', '不太愿意', '意愿一般', '比较愿意', '非常愿意'],
    interpretation: '把感兴趣的方向变成一次短期试做，完成后记录是否愿意继续投入。',
    scale: '自评意愿'
  }
]

const sectionUpdates = {
  interest: {
    prompt: '假如有机会参与这项活动，你会有多喜欢做这件事？',
    labels: ['完全不喜欢', '不太喜欢', '喜欢程度一般', '比较喜欢', '非常喜欢']
  },
  ability: {
    prompt: '回想学习、项目或工作中的类似任务，选出符合当前熟练程度的一项。',
    labels: ['需要全程指导', '需要多次提示', '偶尔需要提示', '能独立处理常见情况', '能独立处理少见情况', '未尝试或无法判断'],
    minimumRatedPerGroup: 5,
    interpretation: '用实际作品或他人反馈复核熟练程度，再试做缺少经历的任务。'
  },
  career_values: {
    prompt: '比较两个职业机会时，这项条件对你有多重要？',
    labels: ['完全不重要', '不太重要', '一般重要', '比较重要', '非常重要']
  },
  environment_preferences: { prompt: '想象这是日常工作方式，你会有多喜欢这样的安排？' },
  career_aspirations: { prompt: '未来两到三年，你有多愿意投入时间尝试这个方向？' }
}

const explorationSource = Object.freeze({
  ...questionnaire.item_source,
  reference_framework: '职趣测评职业探索补充框架'
})

function buildSections(updates = {}) {
  return Object.freeze(legacySections.map((section) => {
    const { labels, ...details } = { ...section, ...updates[section.id] }
    const options = labels
      ? Object.freeze(labels.map((label, index) => Object.freeze({ value: index + 1, label })))
      : standard.response_options
    return Object.freeze({ ...details, options })
  }))
}

function buildDefinition(metadata, groups, updates) {
  const sections = buildSections(updates)
  const revised = Boolean(groups.interest)
  const identity = {
    questionnaire_id: metadata.questionnaire_id,
    questionnaire_version: metadata.questionnaire_version,
    schema_version: metadata.question_schema_version
  }
  const dimensionCounts = Object.fromEntries(metadata.dimension_order.map((code) => [code, 0]))
  const items = interestItems.map((item, index) => {
    const dimensionIndex = dimensionCounts[item.dimension]
    dimensionCounts[item.dimension] += 1
    return {
      ...item,
      ...identity,
      id: `p${String(index + 1).padStart(3, '0')}`,
      text: revised ? groups.interest[item.dimension][dimensionIndex] : item.text,
      options: sections[0].options,
      section: 'interest',
      sectionIndex: index + 1
    }
  })

  for (const section of sections.slice(1)) {
    const blocks = groups[section.id].map(([group, groupLabel, texts]) => texts.map((text) => ({
      group, groupLabel, text
    })))
    // 新版按小轮次交错各主题，避免连续多题围绕同一主题。旧草稿按原顺序续答。
    const sectionItems = revised
      ? blocks[0].flatMap((_, index) => blocks.map((block) => block[index]))
      : blocks.flat()
    for (const [index, item] of sectionItems.entries()) {
      const order = items.length + 1
      items.push({
        ...item,
        ...identity,
        id: `p${String(order).padStart(3, '0')}`,
        order,
        section: section.id,
        sectionIndex: index + 1,
        options: section.options,
        source: revised ? explorationSource : metadata.item_source
      })
    }
  }

  return Object.freeze({
    questionnaire: Object.freeze({ ...metadata, response_options: sections[0].options }),
    questions: Object.freeze(items.map(Object.freeze)),
    sections
  })
}

const current = buildDefinition(questionnaire, itemGroups, sectionUpdates)
const legacy = buildDefinition(legacyQuestionnaire, legacyItemGroups)

module.exports = { ...current, legacy }
