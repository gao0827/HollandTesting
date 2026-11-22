const questionnaire = require('./questionnaire-standard')

const FORWARD_SCORING = Object.freeze({
  rule: questionnaire.scoring_rules.forward.rule,
  direction: 'forward',
  score_map: questionnaire.scoring_rules.forward.score_map
})

const RAW_ITEMS = [
  { id: 'q01', dimension: 'R', text: '亲手组装、修理或调试一件设备' },
  { id: 'q02', dimension: 'I', text: '追查一个现象背后的原理和原因' },
  { id: 'q03', dimension: 'A', text: '用文字、图像或声音表达自己的想法' },
  { id: 'q04', dimension: 'S', text: '耐心倾听别人遇到的困难' },
  { id: 'q05', dimension: 'E', text: '说服他人支持一个值得尝试的方案' },
  { id: 'q06', dimension: 'C', text: '把杂乱的信息整理成清楚的表格或目录' },

  { id: 'q07', dimension: 'R', text: '使用工具完成制作、安装或维护任务' },
  { id: 'q08', dimension: 'I', text: '阅读资料并比较不同解释是否可靠' },
  { id: 'q09', dimension: 'A', text: '为一个主题设计独特的视觉风格' },
  { id: 'q10', dimension: 'S', text: '向不熟悉某个知识的人耐心讲解' },
  { id: 'q11', dimension: 'E', text: '带领大家朝一个共同目标推进' },
  { id: 'q12', dimension: 'C', text: '按照明确步骤核对资料，避免遗漏' },

  { id: 'q13', dimension: 'R', text: '在户外、实验场地或生产现场开展工作' },
  { id: 'q14', dimension: 'I', text: '分析数据，寻找其中的规律或异常' },
  { id: 'q15', dimension: 'A', text: '构思一个没有标准答案的创意方案' },
  { id: 'q16', dimension: 'S', text: '帮助团队成员更好地理解彼此' },
  { id: 'q17', dimension: 'E', text: '主动寻找机会并把想法变成项目' },
  { id: 'q18', dimension: 'C', text: '维护一套稳定、可重复执行的工作流程' },

  { id: 'q19', dimension: 'R', text: '观察实物结构并判断它是如何运作的' },
  { id: 'q20', dimension: 'I', text: '面对复杂问题时提出假设并逐一验证' },
  { id: 'q21', dimension: 'A', text: '修改作品细节，让它更有感染力' },
  { id: 'q22', dimension: 'S', text: '参与教育、辅导、照护或志愿服务' },
  { id: 'q23', dimension: 'E', text: '在讨论中清晰表达立场并促成决定' },
  { id: 'q24', dimension: 'C', text: '管理日程、清单和截止时间' },

  { id: 'q25', dimension: 'R', text: '通过实际试做判断哪个办法更有效' },
  { id: 'q26', dimension: 'I', text: '学习一套有难度的理论或技术知识' },
  { id: 'q27', dimension: 'A', text: '尝试不同的写作、摄影、音乐或设计方式' },
  { id: 'q28', dimension: 'S', text: '了解他人的需求并提供合适的支持' },
  { id: 'q29', dimension: 'E', text: '协调人员和资源解决推进中的障碍' },
  { id: 'q30', dimension: 'C', text: '处理需要准确分类、录入或归档的信息' },

  { id: 'q31', dimension: 'R', text: '操作机器、仪器或专业设备' },
  { id: 'q32', dimension: 'I', text: '独立钻研一个感兴趣的问题较长时间' },
  { id: 'q33', dimension: 'A', text: '把普通内容呈现得新颖而有美感' },
  { id: 'q34', dimension: 'S', text: '组织让大家都能参与的交流活动' },
  { id: 'q35', dimension: 'E', text: '为一个产品、服务或主张进行推广' },
  { id: 'q36', dimension: 'C', text: '检查数字、格式或规则是否完全一致' },

  { id: 'q37', dimension: 'R', text: '完成能直接看到成果的实践任务' },
  { id: 'q38', dimension: 'I', text: '使用逻辑推理排除不合理的结论' },
  { id: 'q39', dimension: 'A', text: '在自由度较高的环境中创作和表达' },
  { id: 'q40', dimension: 'S', text: '在他人取得进步时感到由衷满足' },
  { id: 'q41', dimension: 'E', text: '承担关键决策并对结果负责' },
  { id: 'q42', dimension: 'C', text: '根据标准把复杂事务安排得井然有序' },

  { id: 'q43', dimension: 'R', text: '解决材料、结构或设备方面的实际问题' },
  { id: 'q44', dimension: 'I', text: '设计调查或实验来获得更可靠的证据' },
  { id: 'q45', dimension: 'A', text: '从不同角度重新诠释一个熟悉的主题' },
  { id: 'q46', dimension: 'S', text: '通过沟通帮助别人建立信心' },
  { id: 'q47', dimension: 'E', text: '在竞争或挑战性目标中争取更好结果' },
  { id: 'q48', dimension: 'C', text: '长期维护记录，使信息随时可查' },

  { id: 'q49', dimension: 'R', text: '通过测量和调整让一个装置运行得更稳定' },
  { id: 'q50', dimension: 'I', text: '比较多种证据，判断哪种解释更合理' },
  { id: 'q51', dimension: 'A', text: '为一次活动构思有主题感的内容和氛围' },
  { id: 'q52', dimension: 'S', text: '陪伴他人制定适合自己的学习或成长计划' },
  { id: 'q53', dimension: 'E', text: '为团队争取资源并推动计划获得支持' },
  { id: 'q54', dimension: 'C', text: '建立清晰的命名和编号规则管理资料' },

  { id: 'q55', dimension: 'R', text: '把设计方案制作成能够实际使用的成品' },
  { id: 'q56', dimension: 'I', text: '为一个未知问题建立分析框架或模型' },
  { id: 'q57', dimension: 'A', text: '用新的形式讲述一个值得分享的故事' },
  { id: 'q58', dimension: 'S', text: '在群体讨论中促进每个人表达和参与' },
  { id: 'q59', dimension: 'E', text: '在信息不完全时组织讨论并推动决策' },
  { id: 'q60', dimension: 'C', text: '定期检查记录并修正不一致的数据' }
]

module.exports = Object.freeze(RAW_ITEMS.map((item, index) => Object.freeze({
  id: item.id,
  questionnaire_id: questionnaire.questionnaire_id,
  questionnaire_version: questionnaire.questionnaire_version,
  schema_version: questionnaire.question_schema_version,
  order: index + 1,
  dimension: item.dimension,
  text: item.text,
  options: questionnaire.response_options,
  reverse_scored: false,
  scoring: FORWARD_SCORING,
  source: questionnaire.item_source
})))
