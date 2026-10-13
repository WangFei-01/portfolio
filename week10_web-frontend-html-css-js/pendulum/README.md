# 🌐 单摆模拟器 · Web 前端 Week 10 实战

> 本目录是 [Week 10 — Web 前端入门](../README.md) 课程实践项目：  
> 一个**完整可运行**的单摆模拟器，覆盖 **HTML 语义 / CSS Grid 与响应式 / JavaScript 物理模拟与本地持久化** 三件套。

---

## 🚀 一秒上手

```bash
# 方式一：直接双击 index.html (Chrome/Edge/Firefox/Safari)
# 方式二：本地起一个静态服务器
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000/index.html
```

> ⚠️ 推荐用本地服务器方式，原因是某些浏览器对 `file://` 协议的 `localStorage` 行为不一致。

---

## 🎯 验收对照

| 验收项 | 实现细节 | 文件 |
| --- | --- | --- |
| **4 个天体胶囊按钮**（地球 / 月球 / 木星 / 太空），点击后**平滑过渡重力**并**同步更新滑块** | 4 个 `<button class="capsule">` → `startTransition()` 用 `easeInOutCubic` 在 600ms 内对 `state.g` 做缓动插值；同步刷新 `<input type="range" id="g-slider">` 与 legend | `index.html` `script.js` |
| **滑块自定义 → 自动覆盖预设** | 用户拖动 `g-slider` 时 `state.activeScene = "custom"` + `aria-checked="false"` 全灭 | `script.js` |
| **`localStorage` 自动保存** | 任意 input/click 后 `persistDebounced()`（200ms 防抖）写入 key `pendulum.config.v1` | `script.js` |
| **页面重新加载自动恢复** | IIFE 起始 `loadConfig()` 读取 + 健全性校验（数字 & 合法 scene 名），apply 到 state | `script.js` |
| **移动端触屏 + 响应式** | `<meta viewport>` + `touch-action: none` 防止画布被滚动；CSS `dvh` + `@media (max-width: 768px)` 上下堆叠；<380px 切胶囊 4 列→2 列 | `index.html` `style.css` |
| **控制台 0 报错** | 所有异常分支 `try/catch` + `console.warn`；DOM 查询在 IIFE 顶层，`<script defer>` 保证 DOM 就绪 | `script.js` |

---

## 🔬 物理模型 (RK4 数值积分)

```
θ''(t) = -(g / L) · sin θ(t) - d · θ'(t)
```

- **g**: 重力加速度 (m/s²)
- **L**: 摆长 (m)
- **d**: 阻尼系数 (1/s)
- **θ**: 当前角位移 (rad)
- **ω = θ'**: 角速度 (rad/s)

我们用 **RK4 (4 阶 Runge-Kutta)** 做数值积分：
- dt 一般是 16 ms (60 fps)
- 子步进：每帧最多切 10 个 dt 子步以保持稳定
- 高角度下用 sin 而非线性化近似，保证大振幅仍精确

---

## 🌌 天体预设数据

| 天体 | g (m/s²) | 周期 (L=1.5m) |
| --- | --- | --- |
| 🌏 地球 | 9.81 | 2.46 s |
| 🌙 月球 | 1.62 | 6.04 s |
| 🪐 木星 | 24.79 | 1.54 s |
| 🛰️ 太空 | 0.20 | 17.20 s |

> 单摆周期公式：T = 2π · √(L / g)

---

## 🗄️ localStorage 数据结构

```json
{
  "g": 9.81,
  "L": 1.5,
  "damping": 0.05,
  "theta": 0.4887,
  "paused": false,
  "activeScene": "earth"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `g` | number | 重力 m/s² |
| `L` | number | 摆长 m |
| `damping` | number | 阻尼 1/s |
| `theta` | number (rad) | 初始角度 |
| `paused` | bool | 是否暂停 |
| `activeScene` | enum | `earth` / `moon` / `jupiter` / `space` / `custom` |

启动时若取到的值**类型不对**或**非有限数**，自动回退默认值，不会因为脏数据导致崩溃。

---

## 🧠 关键设计权衡

1. **过渡 vs 直接跳变**：胶囊切换用 `easeInOutCubic` 600ms 缓动；状态过渡期间滑块与 legend 实时跟随，最终视觉感受是"重力被温柔地拉过去"。
2. **自定义场景的语义**：拖动 `g-slider` 即视为"用户在玩自己的配置"——所有胶囊 `aria-checked="false"`。
3. **持久化用防抖**：连续 `input` 事件不会每帧写盘，写盘动作 200ms 内合并一次。
4. **DPR 上限 3**：避免 4K 屏幕把 canvas 切到 16K × 9K 拖累 GPU。
5. **`prefers-reduced-motion`**：尊重系统级动效偏好，把所有 CSS 动画时长压到 0.01 ms。

---

## 📂 文件

```
pendulum/
├── index.html   # 结构 + 语义 + 4 天体 + 4 滑块 + 3 按钮
├── style.css    # CSS Variables + Grid + 响应式 + 触屏
├── script.js    # 物理 (RK4) + 渲染 + 持久化 + 过渡
└── README.md    # 你正在看的
```

总计 ~500 行 (含注释)。

---

## ✨ 可以继续扩展的方向 (可选)

- 加一个能量条 (KE / PE / 总能量) —— 演示能量守恒
- 多摆耦合 (双摆 / N 摆) —— 经典混沌系统
- Airy-like: 加阻力与空气密度分离
- 用 PWA + `service-worker` 让它在飞机上也能用
- 接 GitHub Pages 让面试官通过链接直接看
