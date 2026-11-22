function occupationSource(id, title) {
  return {
    title,
    publisher: 'O*NET® OnLine · 美国劳工部就业与培训管理局',
    url: `https://www.onetonline.org/link/details/${id}`,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: '依据 CC BY 4.0，由职趣测评选编并改写为中文。O*NET® 是美国劳工部就业与培训管理局的商标，改编内容未经该机构认可或审核。'
  }
}

module.exports = [
  {
    id: 'equipment-maintenance',
    dimension: 'R',
    title: '工业设备维修',
    roles: ['设备维修技师', '机修工'],
    summary: '检查生产设备、排查故障，并通过维修和保养恢复设备运行。',
    tasks: ['观察设备运行状态，根据异常现象查找故障', '检查或更换磨损零件，并确认维修后的运转情况', '按维护要求清洁、润滑或调整设备部件'],
    activity: '选一个无需拆卸的日常机械装置，画出各部件的连接关系，列出需要观察的三项状态。',
    source: occupationSource('49-9041.00', 'Industrial Machinery Mechanics')
  },
  {
    id: 'data-science',
    dimension: 'I',
    title: '数据科学',
    roles: ['数据科学家'],
    summary: '把原始数据转化为可分析的信息，建立模型并解释结果。',
    tasks: ['整理原始数据，检查缺失值和异常记录', '使用统计或机器学习方法探索数据中的规律', '通过图表和报告向业务伙伴说明发现'],
    activity: '用一份公开数据提出一个可验证的问题，制作一张图表，并写下它支持的结论和仍需补充的信息。',
    source: occupationSource('15-2051.00', 'Data Scientists')
  },
  {
    id: 'graphic-design',
    dimension: 'A',
    title: '平面设计',
    roles: ['平面设计师', '品牌视觉设计师'],
    summary: '根据传播目标设计包装、标识或其他视觉材料。',
    tasks: ['根据需求制作草图和版式方案', '安排文字、色彩和图像的层次', '检查最终版式并根据反馈调整'],
    activity: '为同一场活动做两张海报，分别强调时间和主题，请两个人指出他们最先看到的信息。',
    source: occupationSource('27-1024.00', 'Graphic Designers')
  },
  {
    id: 'learning-development',
    dimension: 'S',
    title: '培训与人才发展',
    roles: ['企业培训师', '学习发展专员'],
    summary: '了解学习需求，设计培训并评估参与者是否掌握了新技能。',
    tasks: ['了解员工遇到的工作困难和学习需求', '编写课程材料，并组织讨论、演练或示范', '收集反馈并评估培训效果'],
    activity: '选一项你熟悉的技能，为初学者设计十分钟的练习，并用一道任务检验对方能否独立完成。',
    source: occupationSource('13-1151.00', 'Training and Development Specialists')
  },
  {
    id: 'project-management',
    dimension: 'E',
    title: '项目管理',
    roles: ['项目管理专员', '项目协调员'],
    summary: '协调进度、人员与预算，推动项目按目标交付。',
    tasks: ['把交付目标分解成任务、里程碑和时间安排', '与团队和相关方协调资源及优先顺序', '跟踪交付进展，并沟通问题和计划调整'],
    activity: '为下一次团队活动列出任务、负责人和截止时间，再写下出现进度延误时的调整方案。',
    source: occupationSource('13-1082.00', 'Project Management Specialists')
  },
  {
    id: 'bookkeeping',
    dimension: 'C',
    title: '会计记录与核对',
    roles: ['会计助理', '应付账款专员'],
    summary: '整理凭证、登记业务记录，并核对账目和单据是否一致。',
    tasks: ['按业务类别记录金额和交易信息', '核对录入数字、分类和凭证，查找差异', '整理应收或应付记录，便于对账和追溯'],
    activity: '用虚构的十笔收支练习分类、记账和对账，再检查每笔记录能否追溯到原始凭证。',
    source: occupationSource('43-3031.00', 'Bookkeeping, Accounting, and Auditing Clerks')
  }
]
