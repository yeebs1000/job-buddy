# Job Buddy（中文摘要）

本地优先的求职申请仪表板：将招聘邮件转换为经审核的申请更新，把进度、截止日期、薪酬证据和公司评分放在一个页面，减少 Excel 手动维护。

[English](README.md) · [路线图](ROADMAP.md) · [隐私](PRIVACY.md) · [安全](SECURITY.md)

## 发布状态

当前源码候选版本为 **`1.0.0-beta.18`**，尚未提供普通用户安装包。

V1 目标是 **Windows 和 macOS 可下载的本地应用**，不是托管 SaaS。用户最终不应需要另外安装 Node、Docker 或输入命令。Gmail 和在线研究仍需联网。先完成并验收 V1 功能，再构建安装包。

目前完整功能以 Windows 开发版为准；Gmail 凭据、候选人资料和 Tavily 密钥依赖 Windows DPAPI。macOS 安全存储、启动和真机验收尚未完成。Google 配置/适用审核、真实账号验收及发布检查仍是独立门槛。详见 [V1 检查表](docs/releases/v1-launch-checklist.md)。

## 核心流程

1. 只读连接 Gmail，扫描直接或受支持的转发招聘邮件。
2. 审核建议，匹配已有申请，或核对预填信息后创建申请；招聘邀约单独保存为机会。
3. 在 Command Center 查看申请进度、结果、截止日期、已保存薪酬区间、证据置信度和有来源的员工评分。
4. 手动追踪和 Excel 导入导出作为补充；新工作区不会自动加入演示邮件或示例申请。

默认需要审核。安全自动更新不会直接处理 offer、终止结果、匹配冲突或不确定邮件。Job Buddy 不发送或删除邮件，失败扫描不会改用演示数据。

## 开发者启动（不是最终用户安装方式）

在 Windows PowerShell 中：

```powershell
git clone https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm.cmd ci
npm.cmd run dev
```

Node 要求及完整说明见 [Windows quick start](README.md#windows-quick-start)。打开 `http://127.0.0.1:5173`，保持终端运行；不同浏览器、地址和端口的数据彼此独立。

- Gmail：在设置中配置测试用 Desktop OAuth 客户端并连接 Google。参见 [Gmail 配置](docs/gmail-maintainer-setup.md)。
- 研究：在 **Settings → Research search** 保存 Tavily API key，然后在仪表板刷新。只发送公司、职位、地点和搜索用途，不发送简历、资料或邮件正文。**不需要 Docker 或 SearXNG**。证据不足时不生成虚构范围。参见 [研究说明](docs/local-search.md)。
- 可选 Browser Buddy：运行 `npm.cmd run build:extension`，在 Chrome/Edge 加载 `dist-extension` 文件夹并配对。不会上传文件、填写密码/验证码、解 CAPTCHA 或提交申请。现有答案、敏感及不支持的字段需要人工审核或处理。
- 没有接入 AI 模型；可选 AI 辅助列入 V2 候选方向，不是现有功能。

端口 5174 的浏览器核心版仅供工程测试，不包含实时 Gmail、研究和扩展配对，不是发布入口。先前托管网站方向已由本地下载方向取代。

## 数据与验证

申请、邮件证据和研究保存在当前浏览器 IndexedDB。Windows companion 的凭据及资料使用当前用户 DPAPI 加密，但不能防止使用同一已解锁设备/浏览器的人访问数据。

Excel 导出不是完整备份；完整工作区迁移使用设置中高级选项的口令加密备份。清除浏览器数据、删除资料、断开 Gmail 和撤销扩展配对是不同操作。不要在 Issue、PR 或截图中上传真实邮件、简历、token 或申请记录。

检查命令及已知限制见[英文说明](README.md#development-and-verification)和[带日期的发布记录](docs/releases/2026-09-30-release-hardening.md)。本地测试通过不等于 macOS、Google 或安装包验收完成。

Job Buddy 使用 [MIT License](LICENSE)。
