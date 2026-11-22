const { COMPLETION_STATUS } = require('../config/product')
const { DIMENSION_ORDER, RIASEC } = require('../data/riasec')
const { getReportPlan } = require('../data/report-plans')
const { listCareers, listCases } = require('./knowledge-service')

const workActivities = {
  R: '动手制作、调试或维护',
  I: '调查问题、分析证据',
  A: '构思方案、做出创意表达',
  S: '沟通需求、帮助他人学习',
  E: '协调资源、推动决策',
  C: '整理信息、核对流程'
}

function buildInterestProfile(record) {
  if (!record || (record.completion_status && record.completion_status !== COMPLETION_STATUS.COMPLETED)) {
    return null
  }

  const storedDimensions = Array.isArray(record.dimensions) ? record.dimensions : []
  const dimensionByCode = Object.fromEntries(storedDimensions.filter(Boolean).map((item) => [item.code, item]))
  const dimensionScores = Object.fromEntries(DIMENSION_ORDER.map((code) => [code, dimensionByCode[code]?.rawScore]))
  const scores = [record.riasec_scores, record.rawScores, dimensionScores].find((source) =>
    source && DIMENSION_ORDER.every((code) => Number.isFinite(source[code]) && source[code] >= 0)
  )
  if (!scores) return null

  const dimensions = DIMENSION_ORDER.map((code, order) => {
    const { name, color } = RIASEC[code]
    const saved = dimensionByCode[code]
    const percentage = saved && saved.rawScore === scores[code] &&
      Number.isFinite(saved.percentage) && saved.percentage >= 0 && saved.percentage <= 100
      ? saved.percentage
      : null
    return { code, order, name, color, rawScore: scores[code], percentage }
  })

  const ranking = dimensions.slice().sort((a, b) => b.rawScore - a.rawScore || a.order - b.order)
  const [first, second, third, fourth] = ranking
  const code = ranking.slice(0, 3).map((item) => item.code).join('')
  const leading = ranking.filter((item) => item.rawScore === first.rawScore)
  const exploration = ranking.filter((item) => item.rawScore >= third.rawScore)
  const tieNotes = []

  let summary = `先从「${workActivities[first.code]}」入手，再在同一个项目中尝试「${workActivities[second.code]}」与「${workActivities[third.code]}」。比较你最愿意反复投入的是哪一段工作。`
  if (leading.length > 1 || third.rawScore === fourth.rawScore) {
    summary = '从感兴趣的工作活动中选两项，各做一次规模相近的尝试。记录你是否愿意再做一次，以及最有吸引力的环节。'
  }

  if (leading.length === ranking.length) {
    tieNotes.push('六个维度得分相同，可从任意两类活动开始试做。')
  } else {
    if (leading.length > 1) {
      tieNotes.push(`${leading.map((item) => item.name).join('、')}并列最高分。`)
    }
    if (third.rawScore === fourth.rawScore) {
      const boundary = exploration.filter((item) => item.rawScore === third.rawScore)
      tieNotes.push(`${boundary.map((item) => item.name).join('、')}在前三边界并列，都纳入探索范围。`)
    }
  }

  return {
    code,
    dimensions,
    summary,
    tieNotes,
    activities: exploration.map((item) => ({
      code: item.code,
      name: item.name,
      text: workActivities[item.code]
    }))
  }
}

function buildDeepReport(record) {
  const profile = buildInterestProfile(record)
  if (!profile) return null

  const plan = getReportPlan(record.user_type || record.userType)
  return {
    profile,
    plan,
    careers: profile.activities.flatMap(({ code }) => listCareers(code).map((career) => ({
      id: career.id,
      title: career.title,
      rolesText: career.roles.join('、'),
      activity: career.activity
    }))),
    cases: listCases().map(({ id, name, title, summary }) => ({ id, name, title, summary }))
  }
}

module.exports = { buildInterestProfile, buildDeepReport }
