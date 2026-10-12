# Changelog

本项目的所有重要改动都会记在这里。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-12

### 新增

- 在 DSH **设置**里新增「Token 用量」分区（`settings.section` 槽位）。
- **今日消耗**：总量 + 输出 / 未缓存输入 / 缓存命中三色明细，可选估算金额。
- **指标网格**：近 7 天、近 30 天、累计、活跃天数、连续使用、缓存命中率。
- **每日消耗热力图**：最近 53 周，GitHub 风格；格子尺寸随面板宽度自适应；
  悬停看当天四类 token 明细，点格子展开「当天明细」（各会话占当天比例）。
- **最近 30 天趋势**：输出 / 未缓存输入 / 缓存命中堆叠柱状图，带网格线与峰值刻度。
- **会话明细表**：可排序、可搜索；窄面板自动精简列，宽面板显示工作区、缓存命中与 30 天迷你条。
- **按模型 / 按工作区**汇总表。
- **成本估算**：填单价（元 / 百万 token）自动换算金额，只存在浏览器 `localStorage`。
- Host 侧只读路由 `GET /token-usage/data`（附 `/token-usage/health`），5 秒缓存 + 增量解析。
- 自动处理「多帧拼接」的 zstd 会话日志（Node 的 zstd 只解第一帧），不依赖外部 `zstd` 命令。
- 浅色 / 深色主题自适应（全部使用 DSH 的 `--dsw-alias-*` 设计变量）。
- 面板内建 error boundary：渲染异常只替换面板自身，不影响设置界面。

[1.0.0]: https://github.com/Jun-Jun-Gao/dsh-token-usage-panel/releases/tag/v1.0.0
