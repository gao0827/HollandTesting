const { USER_TYPES } = require('../config/product')
const { getReportPlan } = require('../data/report-plans')

function buildProfessionalInterestReading(profile, userType) {
  if (!profile?.dimensions?.length) return null
  const ranking = [...profile.dimensions].sort((a, b) => b.rawScore - a.rawScore)
  const first = ranking[0]
  const leaders = ranking.filter((item) => item.rawScore === first.rawScore)
  const next = ranking[leaders.length]
  const names = leaders.map(({ name }) => name).join('、')
  const leadingText = leaders.length === 1
    ? `${names}为最高分（${first.rawScore} 分）。`
    : `${names}并列最高（${first.rawScore} 分）。`
  const comparison = next
    ? `${leadingText}领先下一档 ${first.rawScore - next.rawScore} 分。分差反映这次对不同活动的偏好。`
    : '六种兴趣的得分相同，可选两类活动各试一次，再比较体验。'
  const milestone = getReportPlan(userType).milestones[0]
  return { comparison, nextTitle: milestone.title, nextAction: milestone.action }
}

function buildProfessionalDecisionSteps(profile, sections, userType) {
  if (!profile || !sections.length) return []
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]))
  const focus = (id) => byId[id]?.focusNames
  const activities = profile.activities.map(({ text }) => text).join('、')
  const conditions = [focus('career_values'), focus('environment_preferences')].filter(Boolean).join('、')
  const skill = focus('ability')
  const aspiration = focus('career_aspirations')
  const milestone = getReportPlan(userType).milestones[0]
  const advisor = userType === USER_TYPES.CAREER_ADVISOR
  const invite = advisor ? '请测评者' : ''
  return [
    {
      title: '先选一项愿意重复做的任务',
      text: `${invite}从「${activities}」挑一项试做，记录最投入的环节和是否愿意再做一次。`
    },
    {
      title: '用成果核对技能自评',
      text: skill
        ? `${invite}结合「${skill}」的自评线索，找一件作品或一次真实任务，对照实际完成的步骤。`
        : `${invite}挑一项和兴趣任务相关的技能做短练习，保留成果并请同伴指出一个可以改进的地方。`
    },
    {
      title: '比较两个岗位的实际条件',
      text: conditions
        ? `围绕「${conditions}」，从两个岗位各找一个具体例子，用同一张表记录已确认和待核实的条件。`
        : '分别核对两份岗位的日常任务、工作方式和重视的条件，记下最需要问清的一项。'
    },
    {
      title: milestone.title,
      text: `${aspiration ? `把「${aspiration}」的意愿放进一次小尝试。` : ''}${milestone.action}完成后留下${milestone.output}。`
    }
  ]
}

module.exports = { buildProfessionalInterestReading, buildProfessionalDecisionSteps }
