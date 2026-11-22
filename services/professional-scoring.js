const professional = require('../data/questionnaire-professional')
const guidance = require('../data/professional-guidance')
const { calculateResult } = require('./riasec-scoring')

function isProfessionalAnswer(question, value) {
  return question.options.some((option) => value === option.value || value === String(option.value))
}

function calculateProfessionalResult(answers = {}, { questions, sections } = professional) {
  if (!questions.every((question) => isProfessionalAnswer(question, answers[question.id]))) {
    throw new Error('专业版答案不完整或包含非法选项')
  }

  const interest = calculateResult(questions.filter((question) => question.section === 'interest'), answers)
  const professionalScores = Object.fromEntries(sections.slice(1).map((section) => {
    const minimumRated = section.minimumRatedPerGroup || 1
    const groups = new Map()
    for (const question of questions.filter((item) => item.section === section.id)) {
      if (!groups.has(question.group)) {
        groups.set(question.group, { id: question.group, name: question.groupLabel, total: 0, answered: 0, sum: 0 })
      }
      const group = groups.get(question.group)
      group.total += 1
      const value = Number(answers[question.id])
      // 6 只用于技能自评的“未尝试或无法判断”，不纳入均值。
      if (value <= 5) {
        group.answered += 1
        group.sum += value
      }
    }
    const scores = Array.from(groups.values()).map(({ id, name, total, answered, sum }) => ({
      id, name, total, answered,
      percentage: answered >= minimumRated ? Math.round(((sum / answered - 1) / 4) * 100) : null
    }))
    return [section.id, scores]
  }))
  return { ...interest, professionalScores }
}

function buildProfessionalProfile(record) {
  if (!record?.professional_scores) return []
  const definition = record.questionnaire_version === professional.legacy.questionnaire.questionnaire_version
    ? professional.legacy
    : professional
  return definition.sections.slice(1).flatMap(({ id, label, scale, interpretation, minimumRatedPerGroup }) => {
    const storedGroups = record.professional_scores[id]
    if (!Array.isArray(storedGroups)) return []
    const groups = storedGroups.filter((group) => group && typeof group.id === 'string' &&
      typeof group.name === 'string' && Number.isSafeInteger(group.total) && group.total > 0 &&
      Number.isSafeInteger(group.answered) && group.answered >= 0 && group.answered <= group.total &&
      (group.percentage === null || (Number.isFinite(group.percentage) && group.percentage >= 0 && group.percentage <= 100)))
    if (!groups.length) return []
    const rated = groups.filter((group) => group.percentage !== null)
    const highest = Math.max(...rated.map((group) => group.percentage))
    const leaders = rated.filter((group) => group.percentage === highest)
    const names = leaders.map((group) => group.name)
    const flat = rated.length > 1 && names.length === rated.length
    const focusNames = flat ? '' : names.join('、')
    let summary
    if (!rated.length) {
      summary = minimumRatedPerGroup
        ? `每个主题至少需要 ${minimumRatedPerGroup} 道有效自评，目前暂未达到显示分数的条件。`
        : '本部分缺少可用于评分的自评记录。'
    } else if (rated.length === 1) {
      summary = `目前只有「${names[0]}」可计分（${highest}%）。可以先核对这一项的实际表现。`
    } else if (flat) {
      summary = '可计分的主题得分相同。任选两项做同等规模的尝试，再比较实际体验。'
    } else {
      const scope = rated.length < groups.length ? '在已达到评分条件的主题中，' : ''
      const tie = names.length > 1 ? '并列' : ''
      summary = `${scope}${names.join('、')}${tie}得分最高（${highest}%）。`
    }
    const answered = groups.reduce((sum, group) => sum + group.answered, 0)
    const total = groups.reduce((sum, group) => sum + group.total, 0)
    const coverage = id === 'ability' ? `有效自评 ${answered} / ${total} 题 · ${rated.length} / ${groups.length} 个主题可计分` : ''
    const checks = focusNames ? leaders.flatMap(({ id, name }) =>
      Object.prototype.hasOwnProperty.call(guidance, id) ? [{ id, name, action: guidance[id] }] : []
    ) : []
    return [{ id, label, scale, interpretation, summary, groups, coverage, focusNames, checks }]
  })
}

module.exports = { isProfessionalAnswer, calculateProfessionalResult, buildProfessionalProfile }
