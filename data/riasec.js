const DIMENSION_ORDER = ['R', 'I', 'A', 'S', 'E', 'C']

const RIASEC = {
  R: {
    code: 'R',
    name: '现实型',
    englishName: 'Realistic',
    illustration: '/assets/interest-types/r.jpg',
    activitySummary: '喜欢动手制作、操作工具，或把设备调试到能正常运行。',
    exploration: '设备维修、机械工程、现场技术',
    shortName: '实作',
    color: '#2563EB',
    lightColor: '#DBEAFE',
    tagline: '偏好动手、工具与具体成果',
    description: '你通常喜欢通过实际操作解决问题，重视可观察、可验证的成果，对工具、设备、自然环境或技术任务更容易产生兴趣。',
    strengths: ['动手实践', '空间与机械理解', '务实执行', '解决具体问题'],
    careers: ['工程技术', '智能制造', '建筑与测绘', '设备运维', '农业与环境', '运动与户外']
  },
  I: {
    code: 'I',
    name: '研究型',
    englishName: 'Investigative',
    illustration: '/assets/interest-types/i.jpg',
    activitySummary: '喜欢追问原因、分析数据，并用观察或实验验证想法。',
    exploration: '数据分析、科学研究、实验测试',
    shortName: '研究',
    color: '#7C3AED',
    lightColor: '#EDE9FE',
    tagline: '偏好分析、探索与理解规律',
    description: '你通常享受观察、分析和推理的过程，愿意钻研复杂问题，并倾向于用证据、模型或系统方法形成判断。',
    strengths: ['逻辑分析', '独立研究', '学习复杂知识', '提出并验证假设'],
    careers: ['科学研究', '数据分析', '软件与算法', '医学与生命科学', '咨询研究', '产品研究']
  },
  A: {
    code: 'A',
    name: '艺术型',
    englishName: 'Artistic',
    illustration: '/assets/interest-types/a.jpg',
    activitySummary: '喜欢用画面、文字或声音表达想法，也享受探索不同的创作方式。',
    exploration: '视觉设计、内容创作、影视制作',
    shortName: '创意',
    color: '#DB2777',
    lightColor: '#FCE7F3',
    tagline: '偏好创意、表达与开放探索',
    description: '你通常重视想象力、审美和个性表达，更容易被开放式任务吸引，喜欢创造新的内容、体验或表达方式。',
    strengths: ['创意构思', '审美表达', '感受力', '应对开放式问题'],
    careers: ['视觉与交互设计', '内容创作', '广告与品牌', '影视与音乐', '建筑与空间设计', '文化创意']
  },
  S: {
    code: 'S',
    name: '社会型',
    englishName: 'Social',
    illustration: '/assets/interest-types/s.jpg',
    activitySummary: '喜欢倾听、讲解和陪伴，看到别人学会一件事会有成就感。',
    exploration: '教育培训、咨询、社会服务',
    shortName: '助人',
    color: '#059669',
    lightColor: '#D1FAE5',
    tagline: '偏好沟通、支持与促进成长',
    description: '你通常关注人的感受和成长，愿意通过沟通、教学、服务或协作帮助他人，并从积极的人际影响中获得满足。',
    strengths: ['沟通倾听', '同理支持', '教学辅导', '团队协作'],
    careers: ['教育培训', '心理与社会服务', '医疗护理', '人力资源', '客户成功', '公共服务']
  },
  E: {
    code: 'E',
    name: '企业型',
    englishName: 'Enterprising',
    illustration: '/assets/interest-types/e.jpg',
    activitySummary: '喜欢发起项目、说服他人、协调资源，推动团队达成目标。',
    exploration: '销售、商务拓展、项目管理',
    shortName: '影响',
    color: '#EA580C',
    lightColor: '#FFEDD5',
    tagline: '偏好影响、组织与推动目标',
    description: '你通常乐于发起行动、协调资源并影响他人，关注机会和结果，在需要说服、决策或承担责任的情境中更有动力。',
    strengths: ['目标推动', '说服影响', '资源协调', '决策与担当'],
    careers: ['经营管理', '市场与销售', '创业与商业发展', '项目管理', '公共关系', '投资与商务']
  },
  C: {
    code: 'C',
    name: '常规型',
    englishName: 'Conventional',
    illustration: '/assets/interest-types/c.jpg',
    activitySummary: '喜欢按清楚的步骤整理资料、核对数据，把事情安排得有条理。',
    exploration: '财务与审计、档案管理、流程运营',
    shortName: '秩序',
    color: '#475569',
    lightColor: '#E2E8F0',
    tagline: '偏好规则、细节与有序流程',
    description: '你通常重视准确、秩序和稳定流程，擅长整理信息、遵循标准，并愿意通过可靠的方法把复杂事务管理得清晰可控。',
    strengths: ['细节管理', '流程执行', '信息整理', '准确与稳定'],
    careers: ['财务与审计', '运营管理', '质量管理', '行政与档案', '供应链管理', '数据治理']
  }
}

module.exports = {
  DIMENSION_ORDER,
  RIASEC
}
