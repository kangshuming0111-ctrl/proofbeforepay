# 面馆买卖双方首次使用与真实 AI 验收

- 日期：2026-11-07（墨尔本）
- 起始 commit／线上版本：`025a6638a6b05ea8b9037a47e62c89c5ac9c3f79` / v95
- 本轮主差距 ID：NOODLE-LIVE-AI-FIRST-USE
- 参照作品及准确奖项：2024 Gemini API Developer Competition 最具影响力及观众选择奖 Vite Vere。2026 IBM Bob 八月第一 PHAROS_INC、八月最具创新 Agent Receipt。
- 官方来源及本轮核实：[Google](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) · [IBM Bob 主办方](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)。参照层级为官方描述。

## 动手前的差距

| 差距 ID／维度 | 参照的已核实强项 | 本项目的起点 | 本轮门槛 |
| --- | --- | --- | --- |
| NOODLE-LIVE-AI-FIRST-USE / 指引 | Vite Vere 提供逐步任务指引 | v95 的完整验收清单需展开，顶部动作把焦点直接移到锁定按钮 | 买家可直接阅读完整清单，导航先聚焦清单，锁定仍单独确认 |
| NOODLE-LIVE-AI-FIRST-USE / 证据与行动 | PHAROS_INC 结合实际数据、规则检查和清楚的报告。Agent Receipt 提供可回查证据 | v95 的同案复测只走了人工核对，真实模型输出后的首次使用尚待验证 | 两版同一案例从页面各取得一份新的真实评估，分别核对出处、未验证项、返工及最终决定 |

## DeepSeek 与独立判断

本轮只向 DeepSeek Harness 提供小段源码、已核实的竞品特征及虚构画面。应用内 DeepSeek 验收和 Harness 协作是两个独立环节。审查状态、采用与保留意见、实际发布和重测结果保存于 `outputs/noodle-live-first-use-2026-11-07/` 的回执。

## 本轮实现与验证

买家清单作为常显区域，使用同一份锁定条款。顶部查看动作聚焦清单标题，保持现有侧栏滚动和独立的确认动作。卖家沿用原清单控件。发布版本、角色选择、报告持久化和逐条事实以重测回执为准。

v96 真调用出现未生成报告和请求结果未收到两种状态。盲测买家能判断尚无新证据，但提示没有提供下一步。沿用 PHAROS_INC 的清晰报告维度，只补同一界面的下一步指引。上游拒绝时可先核对预览或稍后重跑；结果未收到时先刷新核对是否已保存。仅记录上游 HTTP 状态，保留原评估标准和明确提交动作。

## 修改后再次对照

| 维度 | 修改前 | 修改后验证项 | 仍有的证据边界 |
| --- | --- | --- | --- |
| 逐步指引 | 买家需要额外展开，焦点跳过清单 | 检查手机和桌面显示、锁定前标题焦点与全部条款 | 独立真人上手证据待补 |
| 规则、模型和可回查证据 | 只跑过同案人工路径 | 检查实际模型建议、原始来源、最终发布判定及人工决定的区分 | 获奖作品仅核实官方说明，缺同案对照 |

Devpost、视频与其他业务场景暂缓。
