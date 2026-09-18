# Job Buddy v1.0.0-beta.16（中文摘要）

Job Buddy 是一个本地优先的求职申请工作区。当前 beta 包括申请追踪、CSV/XLSX 导入导出、Greenhouse/Lever 公司职位发现、本地收藏、官方来源薪酬研究、可选的 Windows 只读 Gmail 更新，以及需要配对的 Chrome/Edge Browser Buddy。

本文只提供简明摘要。安装步骤、受支持字段、故障排查和当前发布状态以[英文 README](README.md)为准；数据流、删除范围和限制以[隐私说明](PRIVACY.md)为准；安全问题请按[安全政策](SECURITY.md)私下报告。

## 当前边界

- 申请、事件、保存视图、收藏、邮件标准化证据和设置主要保存在本机浏览器 IndexedDB；Windows Gmail refresh token 和候选人资料使用当前 Windows 用户的 DPAPI 加密，保存在 `%LOCALAPPDATA%\JobBuddy`。
- Gmail 权限为只读，连接仍取决于维护者的 Google 应用配置、Google 审核及真实账号验收。没有后台云端邮件服务。
- Browser Buddy 支持语义化通用表单，并对 Greenhouse、Workday、Oracle Recruiting 和 Lever 使用稳定标记。它只填写安全、空白且高置信度的字段；现有值、薪酬、工作许可、人口统计、法律、签名、上传和自由文本等项目需要人工处理或批准。
- Browser Buddy 不上传文件、不输入密码或验证码、不解 CAPTCHA，也绝不会点击 Next 或最终 Submit。自定义下拉框、单选框、复选框、重复教育/工作经历和跨域内嵌表单通常需要手动完成。
- 薪酬研究保留来源、地区和日期。可选汇率比较使用 ECB 支持的 Frankfurter 数据，并与原始金额分开显示；它不是生活成本、税费或公司报价预测。
- 公司职位发现只读取用户指定的 Greenhouse/Lever 公共职位板，不是全球职位搜索，也不代表职位仍然有效。收藏不会自动变成申请。
- AI、生成式答案、API-key 设置、云同步、远程资料处理和自动提交均不在此 beta 中。

## 安装和使用

在 Windows PowerShell 中使用 `npm.cmd ci` 和 `npm.cmd run dev`。Browser Buddy 可以从 `npm.cmd run build:extension` 生成的 `dist-extension` 加载；发布 ZIP 必须先解压，再通过 Chrome/Edge 的“加载已解压的扩展程序”载入。完整步骤、端口 5173/43117 排查、配对、撤销和重新连接，请阅读[英文 README](README.md#windows-quick-start)。

CSV/XLSX 导出只包含标准追踪字段，不是完整备份；它不会保留完整生命周期历史、事件备注/证据、内部 ID、保存视图或职位收藏。清除浏览器数据、删除本地资料、断开 Gmail 和撤销扩展配对是不同操作。已经填写到第三方网页的内容不受 Job Buddy 控制，必须在该网站上自行删除或修改。

所有 Issue、Pull Request、fixture 和截图都必须使用虚构数据。不要上传真实简历、求职追踪表、私人邮件、OAuth 凭据、token、Cookie、候选人资料或已填写的表单。

## 发布状态

beta.16 是公开 beta 候选版本，不代表已经发布，也不代表 Google 已批准受限 Gmail 权限。当前验证结果和仍需完成的外部门槛见 [beta.16 发布说明](docs/releases/v1-beta-16.md)与 [V1 发布检查表](docs/releases/v1-launch-checklist.md)。

Job Buddy 使用 [MIT License](LICENSE)。
