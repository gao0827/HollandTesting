# M01 项目架构设计

## 1. 本阶段边界

M01 只建立模块边界、数据契约、功能开关和测试基线，不改动现有 AppID，不重写现有页面，也不提前实现 M02–M12 的业务功能。

当前标准版 60 道题为项目自编的原型体验题，尚无正式量表来源、授权或信效度证明。在 M04 完成内容审核前，不得对外称为官方量表、标准量表或专业量表。

## 2. 分层原则

```text
页面 pages
  ↓ 只负责展示、交互和页面生命周期
公共组件 components
  ↓ 提供无业务副作用的可复用视图
服务 services
  ↓ 组织测评会话、存储、报告、知识库和商业能力
领域模型 models
  ↓ 定义稳定的数据契约、枚举和校验规则
数据 data
  ↓ 保存有版本、有来源、有授权说明的静态内容
工具 utils
  ↓ 保存无状态纯函数
配置 config
  ↓ 保存环境无关的产品开关和版本常量
```

依赖只能向下。评分函数必须保持纯函数；页面不应包含评分规则。后续将逐步把页面直接调用 `wx` 本地存储的逻辑迁移到服务层，但 M01 不修改现有运行链路。

## 3. 目标目录

```text
assets/                         原创或有明确许可的静态资源及授权清单
components/                     公共组件
config/                         产品配置和默认关闭的商业功能开关
data/
  questionnaires/              题库、版本、来源及授权信息（M04）
  knowledge/                    类型、职业、岗位和人物案例（M08）
docs/                           架构、内容治理、隐私和发布文档
models/                         测评、报告、订单等领域数据契约
pages/                          页面及页面私有样式
services/                       会话、存储、报告、知识库、商业服务
tests/                          无第三方依赖的单元和结构测试
utils/                          纯工具和评分函数
```

## 4. 页面规划

| 模块 | 规划页面 | 说明 |
|---|---|---|
| M02 | `pages/index` | 首页、六边形、指南针和入口 |
| M03 | `pages/assessment-select` | 用户类型和测评版本选择 |
| M05 | `pages/assessment` | 统一答题引擎 |
| M07 | `pages/result` | 简版结果和深度报告入口 |
| M08 | `pages/knowledge`、`pages/career-detail`、`pages/case-detail` | 知识库 |
| M09 | `pages/report` | 深度报告与行动路线图 |
| M10 | `pages/history`、`pages/history-detail`、`pages/data-settings` | 记录和数据管理 |

现有页面继续保留；新增页面必须先通过模块验收再注册到 `app.json`。

## 5. 核心测评记录契约

所有完成或中断的测评会话最终统一使用以下字段：

```text
questionnaire_id
questionnaire_version
scoring_version
assessment_id
user_type
assessment_type
answers
riasec_scores
top_codes
completion_status
created_at
```

时间戳统一使用 Unix 毫秒数。`answers` 保存题目 ID 与原始选择值，评分结果不得覆盖原始答案。

专业版的以下四部分必须作为独立区块存储和评分，禁止混入 RIASEC 六维分数：

- `ability`
- `career_values`
- `environment_preferences`
- `career_aspirations`

M10 读取旧版历史时保留原始结果和可确定的契约字段。旧记录缺失的身份、答卷及版本信息保留为空。写入本机数据时迁移旧格式，草稿按测评版本和身份管理。

## 6. 服务边界

- `questionnaire-service`：按 ID、版本、用户类型和测评类型读取题库。
- `assessment-session-service`：创建、恢复、更新和完成测评会话。
- `scoring-service`：根据明确版本调用评分规则，拒绝非法输入。
- `storage-service`：统一封装本地存储、迁移、容量异常和删除。
- `report-service`：生成简单报告和深度报告数据，不负责支付。
- `knowledge-service`：读取带来源信息的职业、岗位和人物案例。
- `commercial-service`：广告、支付、订单和退款接口；默认关闭。

## 7. 商业与内容安全

- 广告、支付、深度报告解锁默认关闭。
- 未取得平台资质前不得展示可操作的真实支付流程。
- 前端功能开关不能作为订单成功凭证。
- 人物案例只能使用有可靠公开来源的信息，不推断真人 RIASEC 代码。
- 每个外部素材必须记录作者、来源、许可、取得时间和使用范围。

## 8. 每阶段质量门禁

每个模块必须依次完成：

1. 明确本阶段目标和非目标。
2. 列出修改文件。
3. 运行无第三方依赖的自动化测试。
4. 在微信开发者工具执行人工流程验收。
5. 记录遗留问题和风险。
6. 项目负责人确认后才能进入下一模块。

运行 M01 自动化测试：

```text
node --test tests/m01-architecture.test.js
```
