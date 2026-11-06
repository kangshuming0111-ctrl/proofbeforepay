# 第30轮：让下一步真正到达操作位置，并继续已有项目

- 日期2026-11-06 Melbourne；起点主站v81/e6b5b1d05852af340ba206515478dee75330993b；第28/29轮均已通过相应线上受控走查。
- 主差距G30：下一步指向折叠上传区时无效；手机把操作解释裁掉；返回首页无法直接继续已有项目，体验按钮总是新建。
- 参照Vite Vere（Google2024 Most Impactful App & People's Choice，逐步任务帮助）、Prospera（Most Useful App & Best Flutter App，即时反馈）、The Green Room（IBM Bob2026 Grand Prize，直接任务/输入产出）。官方描述，2026-11-06重核：https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ ，https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html 。没有对手相同首次成功率/点击数。

## 动手前的差距

|维度|起点实际证据|本轮门槛|
|---|---|---|
|用户价值/易用|虚构样例锁范围后卖家点击下一步，uploadOpen=false、fileRect0、焦点仍原按钮；该focusPanel实现在v81未改|下一步展开祖先后聚焦现有控件，缺目标有可见fallback；不自动弹文件选择或提交|
|易用/手机|375px实测下一步help clip rect0，几何0；样式在v81未改|状态/理由可读可换行，320/375/桌面无横向溢出|
|完整链条|已有Cases与openCase GET，但welcome体验每次POST新样例|有当前角色既有记录时主CTA继续、显示标题/状态；新用户仍2主路线；新建样例在可选区|
|功能深度|已有quote/role/delivery响应保护，但通用RAF定位无身份保护|定位前核对当前项目/交付/角色和最新意图，旧请求不跳到新项目；不破坏原同意状态|
|AI贡献|AI只在明确点击时运行|恢复/定位不调用AI、不自动执行Next的业务动作|
|可信度|记录器是operator试用；无人类研究|不新造引导填表/完成率；既有受控走查不算真人结果|

## DeepSeek与主代理裁定

有效方案讨论cycle30-plan-deepseek.json已取得。采纳新样例说明相随、共享当前身份/最新意图焦点保护；“更多示例与开发者工具”不等于将所有项目称开发者工具，未强制改名。恢复不自动执行Next；手机说明本在guided-workspace-bar而非welcome隐藏区。审阅误称上传open未含pendingFiles/uploadError，源码实际包含，未据此改状态。独立来源审查另外核实旧单人工具缺目标，纳入导航修复。现有records初始由服务端updatedAt排序，但本地apply按createdAt排序，故显示“继续已有项目”，不声称最近更新/最近创建/上次查看。

## 实现与验证

已复用第29轮scoped reveal helper；focusPanel展开并聚焦唯一控件，缺目标定位说明并保留通知。普通/证据/验收/记录/恢复的排队聚焦使用同一项目/交付/视角和意图serial；technical请求共用单调序号，清除后不复用id1。publishQuoteResponseView在身份变化时同步清除临时请求并推进serial，A→B→A也取消旧frame，相同身份刷新不取消当前请求。

手机guided-workspace-bar解释取消clip并换行，主按钮可换行。已有项目卡显示标题/状态，主CTA明确“打开这个项目”，通过原openCase GET恢复；无历史仍是原两个主入口，新虚构例子放选填区且模拟/AI边界相随，不增加“上次/最近”数据追踪。

独立核实并修复旧模式无交付路径：有资格的单人工具买家先切交付显示视图；自定义卖家定位实际文件输入；旧内置案例定位唯一is-flawed样例按钮而不点击；真实协作买家仍查看实际卖家进度。服务端身份/范围/付款/验收门槛未改。

实际函数AST回归14项、welcome实际组件7项，相关响应顺序/卖家导航组合43/43、全量1671/1671、打包器12/12、类型0。旧响应测试夹具缺新UI closure依赖导致的失败原件保留，仅补真实scheduler提取和serial引用，原断言未削弱；最终恢复通过。

有效welcome后审无finding；Root最终有效后审的“first record不是last所以wrong project”P2依赖不存在的last承诺，卡片展示与回调为同一记录，独立驳回功能缺陷；采纳最小文案精准化为Open this project，不新增排序/存储。早前上传错误P3同时越出packet路径未准入，实际catch抛给全局alert，最终审阅已撤回。完整裁定及纯文案哈希差异在忽略目录。

## 修改后再次对照

|同一G30门槛/参照|修改前|本地修改后/证据|状态及保留项|
|---|---|---|---|
|逐步实际任务（Vite Vere）|下一步聚焦关闭上传/旧模式不存在输入|scoped reveal、明确旧模式显示路由、受控fallback；真实函数14项回归|代码门槛通过，真实浏览器待最终发布验证|
|及时可理解反馈（Prospera）|375px下一步解释被裁成0|原宿主显示并换行，未新造教程表单|源码/类型通过，320/375实际几何待验|
|清晰任务入口（The Green Room）|已有记录仍默认新建例子|两个主入口，有项目时打开明确标题记录，新例子选填；7组件测试|回调隔离通过；实际同ID/记录数恢复待验|
|复杂状态与可信度|新导航/视角更换可能重放旧intent|同步身份变更失效、ABA、共享nonce、冻结/权限不变|实函数与原响应顺序测试通过，外部真人仍0|

本轮通过的是我们可执行的工程门槛，没有同条件竞品或真实陌生参与者数据，不能宣称整体超越冠军。真实原生后台业务实现/审核仍必要；Devpost和视频继续暂缓。
