# 标准版与专业版报告

| 版本 | 基础解读 | 进阶报告 |
| --- | --- | --- |
| 标准版 60 题 | 免费阅读 | 免费阅读完整报告和 90／180 天路线。可在末尾展示微信原生模板广告。 |
| 专业版 250 题 | 完整观看激励视频后显示六维罗盘、分差与并列解读、人物案例和一项角色探索行动。每条测评记录在本机保存一次广告解锁状态。 | 针对本次测评单次购买，服务端确认权益后提供四组补充画像、各主题的验证方法、岗位比较建议和 90／180 天路线。 |

广告接入需使用已开通流量主的正式账号。在 `config/commercial.js` 分别填写 `standardReportAdUnitId`（原生模板广告）和 `professionalBasicAdUnitId`（激励视频），并在 `config/product.js` 开启 `advertising`。标准版广告加载失败时报告仍可读。专业版只接受微信回调中的完整播放标记。已完成广告与购买权益分别处理。 [微信广告接入操作指引](https://training.tencentads.com/uploads/202406/EPLBpxYt_5dDA71.pdf)

## 专业版服务端合同

配备符合微信类目与资质要求的账号、正式的虚拟支付道具和服务端后，将 HTTPS 接口前缀填入 `professionalReportApi`，并配置微信小程序合法请求域名。服务端上线、隐私指引核对、支付及恢复购买联调完成后，开启 `payments` 和 `paidReportUnlock`。价格由服务端与虚拟支付商品配置决定。 [腾讯云开发虚拟支付接入参考](https://github.com/TencentCloudBase/skills/blob/main/skills/cloudbase-wechat-integration/references/virtual-payment.md)

下列路由均为 POST，成功返回 HTTP 200，并带回请求的 `recordId`。服务端用每次传入的 `wx.login` 临时 `code` 验证用户身份。权益、报价和订单按已验证的微信用户及测评记录绑定，签名密钥与微信会话密钥保留在服务端。

| 路由 | 请求 | 成功响应 |
| --- | --- | --- |
| `/status` | `recordId`、`code` | `status` 为 `locked`、`pending` 或 `unlocked`。可购买时返回整数分价格 `priceFen` 和有效期受控的 `quoteId`。 |
| `/order` | 同上，外加 `quoteId` 和已展示的 `priceFen` | 服务端复核报价。可拉起支付时返回 `status: payable`、`priceFen` 和已签名的 `payment` 参数。已购买或存在待确认订单时分别返回 `unlocked` 或 `pending`。报价失效可返回 `locked`，客户端要求重新报价与确认。 |
| `/report` | `recordId`、`code`、用户同意提交的 `summary` | 再次核验已生效的权益，返回 `status: unlocked`、`report` 和 `professionalProfile`。 |

`report` 使用现有深度报告视图的数据结构，包含 `profile.dimensions`、`plan.milestones` 和 `careers`。`professionalProfile` 使用专业版补充画像的数据结构。`summary` 仅包含阶段、版本和汇总分数。原始答卷留在本机。报告页每次重新打开时都校验权益。

服务端以微信已验真的发货通知或可信查单结果确认支付，幂等处理重复请求和通知，并在退款后更新权益。支付弹窗返回后会查单，包括取消或异常返回的情况。报价变化时由用户重新确认金额。已购买用户在同一记录下查询权益后，可同意提交汇总分数并查看完整报告。联调需覆盖取消支付、金额变化、重复购买、待确认订单、已购买恢复、退款撤回权益及不同微信账号间的记录隔离。
