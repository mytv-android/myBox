# myBox

兼容 TVBox 配置协议的影视聚合播放器，同时接入 Emby / Jellyfin 与 WebDAV 网盘。

本仓库目前包含：

- **UI 设计稿（征求意见稿 v0.1）**：<https://mytv-android.github.io/myBox/>
  覆盖手机、平板、电视、折叠屏与双屏设备，基于 Material 3 Expressive、Haze 模糊材质与封面动态取色。
- **《TVBox 协议与实现规范》**：[`TVBox协议与实现规范.md`](TVBox协议与实现规范.md)，设计稿中的每个界面元素都能在这里找到对应字段。

## 提意见

设计稿每个界面标题旁都有「对这一屏提意见」，会新建一条带界面编号的 [Issue](https://github.com/mytv-android/myBox/issues)。
附录里的「待讨论问题」可以直接回复编号，例如「Q3 同意」。

## 目录

```
index.html            构建产物（GitHub Pages 直接发布）
src/index.src.html    设计稿主模板
src/sections/         各章节与界面（S01–S20）
assets/css/           app.css 为 M3 组件复刻，doc.css 为文档外壳
assets/js/            posters.js 程序化海报，shapes.js 形状与形变，main.js 取色与交互
assets/vendor/mcu.js  material-color-utilities 0.3.0（取色算法）
assets/fonts/         按页面用字生成的自托管字体子集
tools/build.py        拼装 index.html，--fonts 时重新生成字体子集
```

## 本地预览

```bash
python tools/build.py            # 拼装 index.html
python tools/build.py --fonts    # 改了文案或图标后，重新生成字体子集
python -m http.server 8765       # 打开 http://127.0.0.1:8765/
```

设计稿中的片名、海报、人物与站点名称均为虚构，海报由页面脚本实时绘制。
