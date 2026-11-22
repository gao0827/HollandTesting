# 数据目录说明

当前文件：

- `questions.js`：标准版 60 道自编原型体验题，每个 RIASEC 维度 10 道。每题包含 ID、问卷版本、结构版本、维度、选项、计分方向、反向题标记和来源声明。
- `questionnaire-standard.js`：标准版题库 ID、版本、计分版本、题量、统一选项、正反向分值映射和内容来源元数据。
- `riasec.js`：六种类型的基础展示文案，其中职业方向仍需在 M08 补充来源审核。

当前标准版版本为 `0.3.0-prototype`。60 道题均为项目自编正向兴趣陈述，反向题数量为 0；数据结构已支持反向题，但正式加入前必须完成题意、维度和计分审核。

题目来源字段中的 `self_authored` 仅表示项目自行编写，不代表经过心理测量学验证。不得把这些题目标记为 O*NET®、SDS® 或其他官方量表题目。

后续数据必须采用版本化目录：

```text
questionnaires/<questionnaire_id>/<version>/
knowledge/riasec/
knowledge/careers/
knowledge/people/
```

任何题目、职业数据和人物案例都必须附带来源、授权或内容审核状态。题库发布前必须通过 `models/questionnaire-validator.js` 的结构校验。
