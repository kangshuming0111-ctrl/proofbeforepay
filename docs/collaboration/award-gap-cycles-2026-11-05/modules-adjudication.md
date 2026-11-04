# 第1轮：有限 ESM 依赖观察的实施与独立裁定

日期：2026-11-05。负责范围：`module-dependencies.ts`、deployment source 纯规则与存储运行器、专用测试及原 deployment API smoke。未提交 Git、未部署、未迁移数据库；最终发布与真实线上页面由主代理完成。

## 对照的具体差距

本轮使用主代理 `round-1.md` 中的获奖参照与门槛。Jayu 的公开强项是技术推动可见任务，PHAROS_INC 的相关分类第一名展示数据、确定性检查和报告的联系。该参照只支撑比较维度，不意味着它们实现了本项目的网站依赖检查，也不据此推断对方的全部技术质量。

修改前：v61 能证明所列 HTML/CSS/JS 字节是否一致，但不能发现 `app.mjs → chunk.mjs → 未声明文件` 的具体缺口。一个模块包即使所有已列文件都匹配，仍只得到笼统“依赖图未检查”。

本轮门槛：对服务器实际读取且摘要匹配的 JS/MJS 字节，记录有界的 ES-module import 观察，在不执行代码、不跟随新增 URL 的前提下，显示具体缺声明、无法解析、目标字节不符及传递影响。旧报告与旧验收含义保持原样。

## 实际实现

- 新增 deployment plan **v3**：`moduleAnalysisProtocol: pbp-esm-import-observation-v1` 和由保存 HTML 重建的 `moduleContext`。原生 manifest 仍是 v1。旧调用省略 `analyzeModules` 时继续生成原 v1/v2；旧保存计划的摘要和 schema 不回填或改写。
- 使用直接固定依赖 `es-module-lexer@2.1.0` 的 `/js` 入口。依赖由主代理安装；本实现没有修改依赖文件。该入口不需要 Wasm 或 eval，不执行卖家源码。
- 每个 JS/MJS 最大仍按原字节规则读取 2 MiB，lexer 观察上限为 **512 KiB**；每模块最多 **64** 条引用，全报告最多 **256** 条。模块最多 **32** 个，静态＋动态计划最多 **72** 文件。超限有命名的 unknown，不静默宣称完整。
- 只读取原计划已批准、已声明的文件。相对 import 的目标不会扩展 HTTP 请求集合；路径越界、绝对／跨源／带查询参数／编码路径、裸包、动态表达式、import.meta、属性和扩展阶段都保留有限类别与偏移，不保存不安全原始引用或表达式。
- 活动 import map 和 HTML 遍历超限使相对引用解析保持 unknown。惰性 template 的 content 不作为活动上下文遍历。未实现浏览器 import-map 解释器。
- 每个原始读取保存自己的 source hash、字节数、字符边界及有限 import 观察。UTF-8 解码失败、lexer 失败、超大源码和字节不符均为 unavailable。unavailable 理由必须遵守与真实读取一致的快捷路径优先级。
- 图层只遍历已声明模块，循环使用 visited 终止。下游缺声明、字节不符或 unknown 会传递到依赖它的上游模块。`getModuleDependencyFindings` 为每模块提供聚合结果与具体诊断；不会把256条边全部塞进买家逐项确认摘要。
- 离线验证只重算已保存观察的图关系、路径分类和数据不变式。**JS 源码没有保留，因此离线不能重新运行 lexer，也不能证明源码执行、真实性或完整网站行为。**

## DeepSeek 意见与独立判断

`outputs/award-gap-cycles-2026-11-05/modules-review-1.json` 是完整且协议有效的首次实施审查，提出两项 P2：

1. **“256条总预算会导致后续模块未观察。”** 这是预先明示的资源契约，不是误报通过。第5个模块没有配额时仍保留为 unavailable/reference_budget；图诊断明确区分 reference_budget 和 lexer_failed。新增实际256条反例证明依赖该模块的闭包均为 unknown，模块没有被省略。未采纳要求无限解析或改变本轮资源政策的建议。
2. **“template内importmap会污染活动上下文。”** 复现前提不成立：parse5 将模板内容保存在 template.content，本实现只遍历活动 childNodes。新增反例实际返回 importMapPresent=false，正常相对声明仍被识别。空／无效的活动 import map 统一保守标为 unsupported，是本轮明确范围，并没有声称模拟浏览器映射。

另一次独立自查发现理由校验可以更严格：仅检查 reason 枚举不足以保证它符合 byte mismatch、源大小和预算的执行顺序。已修正为与真实路径相同的优先级，并新增“预算已耗尽却伪称尝试解析”的拒绝测试。

`modules-review-final.json` 为最后一次限定复查，协议有效、completed=true、findings=[]。DeepSeek确认上述两项不是可复现的新缺陷，并认可理由优先级修复；它仅做源码审查，没有运行测试。未继续发散审查。

## 本机实际执行的验证

- `modules-focused-final.log`：**24/24** 通过，其中15项新模块测试和9项旧 HTTP/schema 测试。
- `modules-types-final.log`：TypeScript 零诊断。
- `modules-api-fresh-1.log`：独立构建、全新 D1、外发阻止的 API **6组场景通过**，覆盖真实路由角色与CSRF、并发保留、历史清单、旧报告读取、v3计划持久化、撤销和验收后禁止新清单。阻止外发的读取仍为 unknown，没有凭空生成 lexer 观察。
- 实际 owned HTTP 反例：`app.mjs`、`chunk.mjs`、`index.html` 三个已列文件均字节匹配，但 chunk 导入未声明文件，两个模块的传递结果均为 mismatch。请求日志精确为这三个已列路径，**没有请求清单外的 chunk**。
- 大小、UTF8、lexer、动态引用、凭据/query隐私、importmap、路径穿越、大小写、循环、观察缺失、256预算、元数据篡改、数组重排及对象键序均有具体正反例。
- `legacy-v1-plan.json`、`legacy-v2-plan.json` 是先前实际受控公开观察的 actor-free 计划摘录，保存其原始 planDigest。当前 native validator 接受两者，输入字节未修改。

本轮没有运行浏览器、真实业务模型或付款服务。owned HTTP 和虚构 gateway 身份不等于陌生卖家接入、真实客户材料或独立用户研究。

## 修改后同一门槛的复查

| 原差距 | 本轮之后 | 判定及仍存在的边界 |
| --- | --- | --- |
| 字节全匹配仍不知道内部相对 ESM 缺声明 | 具体到导入模块、目标路径和上游传递影响；有实际HTTP反例 | 此有限门槛已满足；不表示后台或网站功能正确。 |
| 动态、跨源、importmap、过大源码可能被误当已覆盖 | 都留下命名unknown及有限观察，未泄露不安全raw引用 | 范围表达已补齐；这些运行时能力本身仍未实现。 |
| 新能力可能改变旧快照与离线验证含义 | plan3独立版本，旧1/2精确计划继续可读；离线仅重算观察代数 | 本机兼容门槛已满足；新线上页面与公开导出由主代理验证。 |
| 相对获奖作品的技术说服力 | 从笼统unknown进步为可解释、可复查的具体依赖问题 | 技术深度差距部分缩小。还没有同条件竞品实测或外部客户使用效果，不能宣称整体优于冠军。 |
