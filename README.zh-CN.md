# Job Buddy v0.3（求职申请助手）

> 一个本地优先的求职申请工作区，用来替代求职者常用的 Excel 追踪表。

[![Built with React](https://img.shields.io/badge/Built_with-React_19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Storage](https://img.shields.io/badge/Storage-Local--first-2ea44f)](#隐私与安全)
[![Markets](https://img.shields.io/badge/Markets-Singapore_%2B_Hong_Kong-f59e0b)](#项目状态)
[![Preview](https://img.shields.io/badge/Status-Private_preview-6f42c1)](https://github.com/yeebs1000/job-buddy)

[English README](README.md)

Job Buddy 帮助所有正在寻找工作的人集中管理每一份求职申请、当前阶段、截止日期、面试、跟进任务和备注。首个版本面向新加坡和香港，优先支持金融、软件工程、数据、网络安全、云计算及一般 IT 职位。

> [!TIP]
> **小小承诺：** Job Buddy 可以对阶段历史有自己的规则，但绝不会悄悄改写你的过去。

<details>
<summary>✨ 30 秒了解使用流程</summary>

1. 导入现有 CSV/XLSX 追踪表，或手动新增一份申请。
2. 按地区、行业、职位族群、阶段、优先级、标签和截止日期筛选。
3. 打开职位详情，更新阶段、查看完整历史；误操作时可以撤销，但不会删除审计记录。
4. 随时将当前视图或完整追踪表导出为包含标准字段的可携带快照。

</details>

## 项目状态

本地优先的核心追踪功能和演示收件箱已经可以直接使用。Windows 用户也可以选择配置只读 Gmail OAuth；应用仅在页面打开时手动扫描，或每隔至少 24 小时进行一次符合条件的活跃会话扫描，不会在后台运行。

项目目前刻意保持为私有仓库，便于继续完善产品和数据模型。核心分支已经按本地数据边界组织，未来开放协作时不需要推翻基础架构。

## 当前已实现

- Command Center 总览：用六阶段进度轨道展示所有申请，并明确区分仍在流程中和已被拒绝的申请。
- 进行中的阶段使用由浅到深的绿色；被拒绝的申请始终使用红色轨道，同时保留被拒前到达的阶段。
- 类 Excel 的 Applications 工作区：搜索、行业/职位族群/地区/工作方式等筛选、排序、保存视图、列显示、行内编辑、批量操作、归档及手动新增。
- 申请详情页：截止日期、联系人、备注、研究快照、按时间排序的阶段历史、终止结果二次确认，以及保留原记录的撤销功能。
- 经过审核的 CSV/XLSX 导入：列映射、日期/金额/阶段标准化、逐行校验、重复项审阅、包含/排除控制，并且确认前不会写入数据库。
- 支持导出当前筛选结果或全部申请的 UTF-8 CSV 和 XLSX 文件。
- 新加坡/香港的虚构示例数据覆盖金融、软件、数据及一般 IT 职位和申请生命周期；应用也支持在手动新增或导入时使用网络安全和云计算职位族群。
- Windows 上可选的只读 Gmail 连接：首次扫描限制为最近 90 天内最多 500 封收件箱邮件，之后使用 Gmail history ID 增量更新；每条建议明确标记为 Gmail 或 Demo。

## 信息来源与可追溯性

Job Buddy 会区分“用户输入的信息”和“未来连接器可能生成的信息”。当前版本的 `Source` 字段只能由用户填写或从文件导入；应用不会登录任何平台，也不会抓取网页。

| 来源或平台 | 当前版本 | 计划用途 | 边界 |
| --- | --- | --- | --- |
| LinkedIn、公司招聘网站、校园招聘平台、内推、招聘网站 | 新增或导入申请时保存为来源标签 | 保留原始申请来源和职位链接 | v0.3 不连接、不抓取 |
| Gmail / Gmail API | Windows 上可选的只读 OAuth 连接，并保留独立 Demo 收件箱 | 在应用打开期间识别招聘方/HR 回复、阶段建议、面试日期、会议链接、截止日期和跟进任务 | refresh token 使用当前 Windows 用户的 DPAPI 加密；不后台运行；实时失败不会自动切换到 Demo |
| Greenhouse、Workday、Oracle Recruiting、Lever 等 ATS | 尚未连接 | 在平台和浏览器环境允许时，提供用户确认后的自动填表和职位链接记录 | 不承诺无人值守提交，也不绕过平台限制 |
| Glassdoor、Levels.fyi、官方薪资信息及地区薪资数据 | 尚未连接 | 提供新加坡/香港的薪资范围和公司评价参考 | 需要逐个验证授权、时效、地区覆盖和数据许可 |
| JobSpy 及公开职位信息 | 尚未连接 | 可选的职位发现和去重输入 | 发现数据不等于申请状态事实 |
| 用户选择的 AI 服务商 | 尚未连接 | 生成面试题、整理邮件分类建议和制定准备计划 | 未来版本可支持用户填写 API key 和选择模型；v0.3 不保存 AI 凭据 |

未来生成的事实计划记录来源、地区、获取时间、置信度和用户修改。连接器可以提出阶段变更建议，但最终申请阶段始终由用户确认。

## 版本路线图

以下是计划，不代表当前已经具备的功能。

### V0.3 — 核心追踪器与 Gmail 更新智能（当前）

本地保存、可视化阶段追踪、筛选与保存视图、带历史/撤销的手动更新、经过审核的表格迁移、新加坡/香港支持、Demo 收件箱，以及 Windows 上可选的只读 Gmail 更新。

### 后续版本 — 信息与准备层

地区薪资和公司评价研究、针对招聘/技术/case/文化/终面的准备工作区，以及用户自行配置的 AI 服务商。

### V2.0 — 申请助手

个人资料和文件保险箱、可配置的“需要审批/不受限”自动化模式、面向 Greenhouse/Workday/Oracle 等 ATS 的用户确认式自动填表辅助、申请清单，以及更广泛的金融、工程和 IT 职位覆盖。

### V3.0 — 可迁移与协作

更多地区、可选加密同步、跨设备备份/恢复、更多服务商连接器、无障碍完善，以及范围明确的多人或导师协作流程。

## 隐私与安全

V1 是单用户、本地优先的应用。申请、导入记录、事件和保存视图存储在浏览器 IndexedDB 中。当前版本没有云端数据库、Gmail 连接、后台邮件扫描、AI 凭据或远程职位抓取。

这是隐私边界，不代表能够防御所有设备访问者。清除浏览器数据或更换设备前，请先导出快照；但不要把标准 CSV/XLSX 导出当作可恢复的备份：它会刻意省略生命周期历史、事件备注、证据、内部 ID 和保存视图。不要把真实求职表、导出文件、邮件正文、API key、Cookie 或个人信息提交到仓库。

CSV 和 XLSX 文件在本地解析。XLSX 导入刻意只接受值：公式、宏和过大的工作表会被拒绝，原始格式也不会保留。`xlsx` 的已知安全提醒仍属于发布风险；当前通过只接受用户明确选择的本地文件、限制大小、拒绝公式/宏以及按需加载表格库来降低风险。

## 快速开始

前置条件：Node 22 使用 Node.js 22.22.2+，Node 24 使用 24.15.0+，或使用 Node 26+ 和 npm。运行 Playwright 浏览器测试还需要 Chromium。

```bash
git clone -b feature/job-buddy-core https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm install
npm run dev
```

Vite 会输出本地地址，通常是 [http://localhost:5173](http://localhost:5173)。

运行可结束的质量检查：

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

构建完成后，如需查看生产预览：

```bash
npm run preview
```

如果尚未安装 Chromium，可执行 `npx playwright install chromium` 安装一次。

## 重置示例数据

本地数据库为空时，Job Buddy 会写入确定性的虚构示例申请。若要重置示例和全部本地申请，请先把需要保留的标准字段导出为快照，再在浏览器的网站数据设置中清除该站点的 IndexedDB 并重新加载应用。应用内无法撤销该清除操作；导出快照不保留生命周期历史、事件备注/证据、内部 ID 或保存视图。

## 仓库结构

```text
src/domain/                  生命周期、筛选、导入契约
src/db/                      Dexie 数据库、迁移、仓储
src/features/                总览、申请表、详情、导入/导出
src/components/              公共壳层、控件、阶段轨道
e2e/                          核心浏览器流程和虚构测试文件
docs/superpowers/specs/      已批准的产品规格
docs/superpowers/plans/      实施计划和审查记录
```

## 参与贡献

请保持改动聚焦，并维护本地优先的隐私边界。行为变更应包含针对性测试；用户可见变更应尽可能补充端到端或无障碍检查。不要把真实用户数据或密钥放入 fixture、截图、Issue 或 Pull Request。

提交变更前请运行：

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

产品方向见[设计规格](docs/superpowers/specs/2026-09-12-job-buddy-design.md)，核心实施顺序见[核心追踪器计划](docs/superpowers/plans/2026-09-12-job-buddy-core-tracker.md)。

## 致谢

特别感谢 [JobSpy](https://github.com/speedyapply/JobSpy)。我们在设计 Job Buddy 的职位来源发现和字段标准化时，借鉴并采用了其中一些实用思路。Job Buddy 的代码结构、数据模型和本地优先实现均独立完成；JobSpy 不是运行时依赖。

## GitHub 清单

- [x] 无需账号的本地优先存储
- [x] 新加坡和香港首发地区
- [x] 导入前审阅的 CSV/XLSX 迁移流程
- [x] 单元测试、组件测试和浏览器流程
- [ ] Gmail 智能识别与每日招聘方扫描
- [ ] 薪资/公司评价研究连接器
- [ ] 用户确认式自动填表助手
- [ ] 可选加密同步

## License

仓库目前还没有 License 文件。在添加 License 前，请不要默认拥有超出你当前代码副本适用权利范围的再使用或再分发权限。
