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
| `/status` | `recordId`、`code` | `status` 为 `locked`、`pending` 或 `unlocked`。可购买时返回整数分价格 `priceFen` 和绑定最近一笔订单的 `quoteId`。已有待确认或已购订单时返回 `orderId`。 |
| `/order` | 同上，外加 `quoteId` 和已展示的 `priceFen` | 服务端复核报价。可拉起支付时返回 `status: payable`、`orderId`、`priceFen` 和已签名的 `payment` 参数。已购买或存在待确认订单时分别返回 `unlocked` 或 `pending`。价格或订单状态变化返回 `locked`，引导用户重新报价。 |
| `/report` | `recordId`、`code`、用户同意提交的 `summary` | 再次核验已生效的权益，返回 `status: unlocked`、`report` 和 `professionalProfile`。 |

`report` 使用现有深度报告视图的数据结构，包含 `profile.dimensions`、`plan.milestones` 和 `careers`。`professionalProfile` 使用专业版补充画像的数据结构。客户端在报价前校验本地记录是否能生成报告。`summary` 仅在用户确认查看已购报告后提交，包含角色、版本和汇总分数。首次生成绑定该组分数的校验值，原始答卷留在本机。报告页每次重新打开时都校验权益。

服务端以微信已验真的发货通知或可信查单结果确认支付，幂等处理重复请求和通知，并在微信确认退款后更新权益。支付弹窗返回后会查单，包括取消或异常返回的情况。微信确认旧订单未创建成功或已关闭时，可使用新报价开始下一笔购买。微信暂未确认时保留原订单并显示订单编号。恢复购买需要保留同一条本地测评记录，并使用原购买微信账号。

## 开发者工具预览

购买尚未配置时，在微信开发者工具中打开开发版的专业版报告页，选择「预览本次完整报告」。预览使用该记录的本地分数，展示四组画像、岗位比较和行动路线。体验版和正式版通过微信购买权益获取报告。

## 运行报告服务

使用 Node.js 24 运行 `node server/index.js`。服务使用 SQLite 持久化微信用户与测评记录的订单关系，报告按用户同意提交的汇总分数即时生成。小程序上传包排除 `server` 目录。

| 服务端环境变量 | 值 |
| --- | --- |
| `HOLLAND_WECHAT_APP_ID`、`HOLLAND_WECHAT_APP_SECRET` | 同一个小程序的 AppID 和 AppSecret |
| `HOLLAND_WECHAT_OFFER_ID`、`HOLLAND_WECHAT_PAY_KEY` | 虚拟支付 OfferID 和对应环境的 AppKey |
| `HOLLAND_WECHAT_PRODUCT_ID`、`HOLLAND_REPORT_PRICE_FEN` | 已发布的报告道具 ID 和对应价格，默认 590 分（¥5.90） |
| `HOLLAND_WECHAT_PUSH_TOKEN`、`HOLLAND_WECHAT_PUSH_AES_KEY` | 消息推送 Token 和 EncodingAESKey |
| `HOLLAND_REPORT_DB_PATH` | 可写持久磁盘或挂载卷上的 SQLite 文件路径 |
| `HOLLAND_WECHAT_PAY_ENV` | 正式环境为 0，沙箱为 1。两套环境分别使用对应 AppKey 和数据库 |
| `HOLLAND_REPORT_HOST`、`HOLLAND_REPORT_PORT` | 可选，默认为 `127.0.0.1` 和 `3000` |

通过 HTTPS 网关发布 `/professional-report`，并将该地址作为小程序的报告接口前缀。微信消息推送 URL 使用同域名的 `/professional-report/notify`，选择安全模式和 JSON，并为商品启用发货推送。服务器按订单、账号和金额核对微信查单结果后交付报告。微信状态暂无法确认时显示待确认。

部署并完成小程序配置后，运行 `node scripts/check-release.js --payment` 核对 HTTPS 服务、AppID、支付环境及售价。实机联调覆盖下单、取消、重新报价、待确认、到账、恢复购买和退款后撤回权益。
