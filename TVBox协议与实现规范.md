# TVBox 与 Emby/Jellyfin 协议实现规范

> **版本** v1.3 ｜ **整理日期** 2026-11-13
> **一手依据**
> - 配置仓库：[a736240087/tvbox](https://github.com/a736240087/tvbox)（外置配置源：`1.json`/`2.json`/`js/`/`jar/`/`json/`/`tvlive/`）
> - 配置仓库：[jinenge/tvbox](https://github.com/jinenge/tvbox)（内置配置版：`tvbox.json` + `lib/`）
> - 客户端源码：TVBoxOSC 系（`com.github.tvbox.osc` 经典版与 `com.kukuqi.tvbox.osc` 模块化重构版）
> - 客户端源码（新增）：[peter-wins/TVBoxOS-M3](https://github.com/peter-wins/TVBoxOS-M3)（AGPL-3.0，Media3 换代 + `pyramid` Python 框架 + SAX XMLTV + DLNA/字幕）、
>   `louisYKL/TVBOX-DolbyVision-HDR10-Edition`（classic 支线 + DV/HDR 能力协商）
> - 爬虫 SDK：`FongMi/CatVodSpider`（Java / Python / QuickJS 三语言官方规范与示例）
> - 媒体服务：`MediaBrowser/Emby` 服务端源码、`jellyfin/jellyfin` 服务端源码、Jellyfin OpenAPI 12.4.0、`jellyfin-sdk-kotlin`
>
> **目标读者**：要从零实现「TVBox 兼容客户端」「TVBox 兼容源（配置/爬虫）」或「Emby/Jellyfin 兼容客户端」的开发者。
> **详细程度**：每个协议点都给出字段名、取值、格式与源码出处，足以照此重写实现；
> 凡本文标注「黄金测试向量」处，均为源码测试用例中逐字节可验证的输入/输出对。

---

## 目录

**第一部分 TVBox**

1. [概述与术语](#1-概述与术语)
2. [生态谱系与兼容矩阵](#2-生态谱系与兼容矩阵)
3. [配置协议（Config JSON）](#3-配置协议config-json)
4. [站点源协议](#4-站点源协议)
5. [播放、解析与嗅探协议](#5-播放解析与嗅探协议)
6. [直播协议](#6-直播协议)
7. [爬虫开发规范（Java / Python / QuickJS）](#7-爬虫开发规范java--python--quickjs)
8. [网络层与基础设施](#8-网络层与基础设施)
9. [第三方应用实现清单](#9-第三方应用实现清单)

**第二部分 Emby / Jellyfin**

10. [Emby 与 Jellyfin 协议](#10-emby-与-jellyfin-协议)

**第三部分 附录**

11. [附录](#11-附录)
12. [本版新增内容索引（v1.1 / v1.2 / v1.3）](#12-本版新增内容索引v11--v12--v13)
---

# 第一部分 TVBox

## 1. 概述与术语

### 1.1 一句话定义

TVBox 是一个「**配置驱动**」的影视聚合播放器：客户端自身不含任何资源，全部内容来自用户填入的一个
**配置地址（Config URL）**。该地址返回一段 JSON，描述：

- 用哪个 **爬虫引擎（spider）**；
- 有哪些 **站点（sites）**，每个站点用什么协议、什么接口地址、什么扩展参数；
- 有哪些 **直播源（lives）**；
- 有哪些 **解析接口（parses）** 与 **播放器标志（flags）**；
- 广告屏蔽（ads）、DNS（doh）、嗅探规则（rules）、IJK 解码配置（ijk）等基础设施。

因此「实现一个第三方 TVBox 应用」= 「完整实现这份 JSON 所描述的全部协议」。这也是本文档的主题。

### 1.2 术语表

| 术语 | 含义 |
| --- | --- |
| 配置 / 配置地址 | 一段可通过 HTTP(S) 或本地路径访问的 JSON，客户端启动时拉取并缓存 |
| 源 | 口语，指「配置」或「站点」；「内置源」指打包在 APK 内的配置，「外置源」指远程配置 |
| 站点（site） | 配置 `sites[]` 中的一个对象，对应 UI 里的一个入口 |
| spider | 配置顶层字段，指向爬虫包；支持 `路径;md5;摘要` 形式 |
| jar 包 | TVBox 的「爬虫包」，后缀 `.jar`，**内容实为 Android `classes.dex`**（不是标准 Java class 集合） |
| csp_* | `site.api` 的一种取值，表示调用 spider 包内的一个爬虫类（CatVod Spider） |
| ext | 站点的扩展参数，字符串或对象，原样传给爬虫；也常指向一个本地/远程 JSON/JS 文件 |
| 采集站 | MacCMS/AppleCMS 系的 `api.php/provide/vod` 接口，对应 `type=0/1` |
| 解析（parse） | 把视频网页 URL 变成直链的过程，由配置的解析接口或 WebView 嗅探完成 |
| 嗅探（sniffer） | 用 WebView 打开页面、拦截其中的视频请求，自动识别直链 |
| 直播源 | `lives[]` 描述的电视频道列表，格式为 txt / m3u / 内联 JSON |
| EPG | 电子节目单，通过 URL 模板 `{name}`/`{date}` 获取 |
| doh | DNS over HTTPS，用于规避 DNS 污染 |
| 弹幕 | 视频上滚动的评论，文件为 XML（`<d>` 元素）或实时 WebSocket 推送 |
| drpy2 | 一类 JS 源引擎（`rule` 对象 + 规则串语法），被大量配置仓库打包进 `lib/` |
| T4 / 海阔规则 | `一级`/`二级`/`推荐` 等规则串语法（`;` 分步、`&&` 取字段、`\|\|` 备选） |

### 1.3 客户端加载配置的完整流程

```
用户填入配置地址
   │
   ├─ 本地文件路径（file://、./相对路径）───┐
   └─ HTTP(S) URL ─────────────────────────┤
                                           ▼
                              下载/读取 JSON 文本
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     │ Gson lenient 解析为 JsonObject              │
                     │（支持 // 、# 注释、单引号、无引号键、尾逗号） │
                     └─────────────────────┬─────────────────────┘
                                           ▼
   spider ──► JarLoader（DexClassLoader 加载 jar，md5 校验）
   sites  ──► SourceBean 列表（key/name/type/api/ext/…）
   parses──► ParseBean 列表（name/url/type/ext）
   flags  ──► vipParseFlags（需要 VIP 解析的播放标志）
   lives  ──► 三种形态归一化成「分组 → 频道 → 多线路」
   rules  ──► VideoParseRuler（host → 规则列表）
   ads    ──► AdBlocker.addAdHost()
   ijk    ──► IJKCode 解码配置
```

> **lenient 解析是硬事实**：两个参考仓库的 `1.json`/`2.json`/`tvbox.json` 顶部都有 `//` 注释，
> 而客户端用 `new Gson().fromJson(jsonStr, JsonObject.class)` 直接解析
> （`ApiConfig.parseJson`，`TVboxOSC-main/app/src/main/java/com/kukuqi/tvbox/osc/api/ApiConfig.java:216`）。
> Gson 的 `newJsonReader()` 会 `setLenient(true)`，因此注释、单引号、无引号键名、尾逗号、`;` 代替 `,` 均被接受。
> **第三方实现必须容忍这些**，否则会解析失败。

---

## 2. 生态谱系与兼容矩阵

TVBox 官方仓库（`CatVodTVOfficial/TVBoxOSC`）已被下架，但大量分支延续了同一套协议。
实现第三方客户端时，按「协议族」而非「App 名称」对齐即可。

| 协议族 | 代表实现 | 站点协议 | 爬虫语言 | 直播 |
| --- | --- | --- | --- | --- |
| 经典 TVBox | TVBoxOSC 各分支、影视仓、Catbox、Easybox | `type` 0/1/3 | Java（dex jar）、QuickJS（`rule` 式 JS） | txt / m3u / 内联 |
| 新一代 CatVod | FongMi TV、CatVodSpider | `type` 3/4 | Java / Python / QuickJS（ES Module，`import {Spider} from "catvod"`） | txt / m3u / 内联 / 爬虫直播 |
| 服务端源 | dr_py、TVBox Node 源 | HTTP JSON API（`/play` 等） | JavaScript（Node）/ Python | — |

**兼容要点**

- 经典与新一代**共享同一份配置 JSON 结构**（`spider/sites/lives/parses/flags/rules/ads/doh/ijk`），
  差别主要在爬虫侧 API 与少量新字段（`lang`、`style.ratio`、`timeshift`、`live_danmaku`、`vod_play_id` 等）。
- 一个「外置配置源」仓库同时服务两个生态：配置里同时出现
  `csp_*`（JAR 爬虫）、`./js/*.js`（JS 源）、`http://…/api.php/provide/vod`（采集站）。
- 第三方客户端若只实现 `type=0/1`（采集站）+ txt/m3u 直播，即可覆盖两个参考仓库约三分之一的站点；
  要「全部可用」，必须实现 **JAR(Dex) 加载**与 **QuickJS 引擎**。

**经典版（classic）的能力缺口**——同一份配置在 classic 上行为不同，第三方实现应按 engine 语义做、
classic 作降级：

| 能力 | classic | engine |
| --- | --- | --- |
| `rules` / `hosts` / `doh` / `headers` / `proxy` | ❌ 不解析 | ✅ |
| `spider`/`jar` 相对路径 | ❌ `loadJar` 不解析 | ✅ |
| `site.type=2` | ❌ 直接返回 null | ✅ |
| 配置解密（`;pk;`/`2423`） | ⚠️ 部分（无 `urls` 多仓） | ✅ |
| 端口上限 | 9999 | 9998 |

### 2.1 可抄骨架的开源实现（按用途选）

官方仓库已下架，下面是**当前仍可访问、且与本文协议一一对应**的开源实现。
第三方实现不必从零写：播放器层、QuickJS 引擎层、Python 框架层、XMLTV 层都有现成可抄件。

| 仓库 | 许可 | 最值得抄的部分 | 对应本文章节 |
| --- | --- | --- | --- |
| `FongMi/CatVodSpider` | — | 三语言爬虫 SDK 与官方契约（`docs/development.md` + 三语言示例） | [7.1](#71-执行环境)–[7.9](#79-打包与加载) |
| `peter-wins/TVBoxOS-M3` | AGPL-3.0 | 播放内核 Media3 换代、直播切台 ANR 修复、SAX 流式 XMLTV、`pyramid` Python 框架、`SpiderApi` 反注入、DLNA/字幕 | [5.8](#581-播放内核选型的实测数据tvboxos-m3agpl-30)、[6.5](#651-频道名归一化xmltvparsernormalizechannelname可直接实现)、[7.13](#713-tvbox-原生-python-框架pyramidtvboxos-m3-实测)、[4.3.3.1](#4331-spiderapi宿主反向注入给-jar-爬虫的能力) |
| `louisYKL/TVBOX-DolbyVision-HDR10-Edition` | — | classic 支线 + DV/HDR 播放能力协商、`IPyLoader`、HawkConfig 全量设置键、RemoteServer | [5.8](#581-播放内核选型的实测数据tvboxos-m3agpl-30)、[7.13](#713-tvbox-原生-python-框架pyramidtvboxos-m3-实测) |
| `kukuqi666/TVBoxOSC` | — | 最贴近官方 classic 的配置解析器与直播解析器 | [3.1](#31-顶层字段全表)、[6.1](#61-lives-的三种形态) |
| `cddlsjy/TVBoxOSC-LiveOnly` | — | 最小 classic 骨架（直播专用），bean/util 层最易读 | [3.3](#33-sites-字段全表)、[5.8](#581-播放内核选型的实测数据tvboxos-m3agpl-30) |
| `jellyfin/media3-ffmpeg-decoder` | — | FFmpeg 软解渲染器注册 | [5.8](#581-播放内核选型的实测数据tvboxos-m3agpl-30) |
| `Doikki/DKVideoPlayer` | — | 播放器控制层封装（ijk/Exo/Media3 统一） | [5.8](#581-播放内核选型的实测数据tvboxos-m3agpl-30) |

**选型建议**：要「协议全兼容」抄 `TVBoxOS-M3`（它同时含 engine/quickjs/python/classic
四条路径与 DLNA、字幕、EPG）；要「最小可跑」抄 `cddlsjy/TVBoxOSC-LiveOnly`；
要「只做播放器」抄 `TVBoxOS-M3/player` + DKVideoPlayer。

> ⚠️ `TVBoxOS-M3` 为 **AGPL-3.0**：若你的客户端链接或分发其代码，须同样以 AGPL-3.0
> 开放源码。仅「按本文档重新实现协议」不受影响——这也是本文档把每个协议都写到
> 可独立复现程度的原因。

---

## 3. 配置协议（Config JSON）

### 3.1 顶层字段全表

下表综合 `ApiConfig.parseJson()`（经典版 `com/github/tvbox/osc/api/ApiConfig.java:225`、重构版
`com/kukuqi/tvbox/osc/api/ApiConfig.java:216`）与 `SourceDescriptor`（重构版 `util/SourceDescriptor.java`）。

**客户端实际读取的顶层键全集**（`VodConfig.parseConfig` / `initList` 逐条核对）：
`msg`、`urls`（多仓订阅 Depot）、`lives`、`wallpaper`、`sites`、`parses`、`spider`、`logo`、`assrt`、
`notice`、`danmaku`、`headers`、`proxy`、`rules`、`doh`、`flags`、`hosts`、`ads`、`ijk`、`epg`。

| 键 | 类型 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `spider` | string | 否 | `""` | 爬虫包地址，支持 `路径;md5;摘要` |
| `sites` | array | 否 | `[]` | 点播站点列表 |
| `lives` | array | 否 | `[]` | 直播源列表（三种形态，见 §6.1） |
| `parses` | array | 否 | `[]` | 解析接口列表 |
| `flags` | string[] | 否 | `[]` | 需要走 VIP 解析的播放标志名列表 |
| `rules` | array | 否 | `[]` | 嗅探/点击规则，`[{"host":"…","rule":["…"]}]` |
| `ads` | string[] | 否 | `[]` | 广告域名列表 |
| `doh` | array | 否 | `[]` | DNS over HTTPS 服务器 |
| `ijk` | array | 否 | 内置默认 | IJK 解码器配置 |
| `hosts` | string[] | 否 | `[]` | 域名劫持，`原域名=目标域名` |
| `wallpaper` | string \| string[] \| object[] | 否 | `[]` | 壁纸；支持逗号分隔字符串、字符串数组、`[{"url":…}]` |
| `epg` | string | 否 | `""` | 全局 EPG 模板 |
| `logo` | string | 否 | — | 顶栏图标（GIF/PNG） |
| `urls` | array | 否 | — | **多仓订阅**：`[{"url":"…","name":"…"}]`，客户端取第一个可加载的配置 |
| `headers` | object | 否 | — | 全局请求头 |
| `proxy` | object | 否 | — | 代理设置 |
| `danmaku` | object | 否 | — | 弹幕设置 |
| `notice` / `msg` / `assrt` | string/object | 否 | — | 公告/提示/字幕 API |
| `videoTypes` | string[] | 否 | — | ⚠️ **非 TVBox 壳字段**（全仓库 grep 0 命中），部分第三方分支可能支持 |
| `warnings` | object | 否 | — | ⚠️ 同上，非标准字段 |
| `jarCache` | string | 否 | `"true"` | **M3 新增**：`"true"/"false"`，控制 jar 缓存能否跳过 md5 校验（见 §4.3.2.1 分支②） |

**⚠️ 顶层键的支持度按分支而变**（M3 `ApiConfig.parseJson` 实测）：

| 键 | M3 是否读取 |
| --- | --- |
| `jarCache` | ✅ **新增，仅此一个真正的新顶层键** |
| `spider` / `sites` / `lives` / `parses` / `rules` / `doh` / `hosts` / `ads` / `wallpaper` / `danmaku` / `proxy` | ✅ |
| `flags` | ✅（按字符串数组读，见 §3.5） |
| `headers` / `logo` / `notice` / `assrt` / `ijk` / `epg` / `msg` | ❌ **不读** |
| `urls` | ⚠️ 仅在「多仓线路列表」场景识别 |

> 结论：**「配置里写了某键」≠「客户端会用它」**。`ijk` 在 M3 里不被读取——
> 软/硬解是内置的两组 option 切换（§5.8.3），不是配置驱动。
> `epg`/`logo` 只在 `lives[]` / `channels[]` 层级被读取，顶层写法无效。


**解析失败的降级行为**（源码事实）：

- `sites` 缺失时整个配置视为「无点播」；`SourceDescriptor.hasVod()` 返回 false。
- `lives` 缺失时不加载直播；`lives` 内含 `proxy://` 时走「远程直播代理」特殊分支。
- `parses` 为空时不插入任何解析；**非空时重构版会在索引 0 插入一个 `name="自动"`、`type=4` 的自动解析**。
- `ads`/`rules`/`ijk` 解析异常被 try/catch 吞掉，不影响其它字段。
- 单条 site/parse 解析失败只丢弃该条，不影响其余。

#### 3.1.1 配置解密协议（`;pk;` 与三种密文）

配置地址本身可以带密钥，密文也可以直接作为配置内容：

```
配置地址：http://host/config.json;pk;<AES密钥>
```

客户端读取流程（`SourceManager.readConfig` → `ApiConfig.FindResult`，`ApiConfig.java:96-122`）：

1. 按**固定字面量 `;pk;`** 切分地址，第二段为 AES 密钥。
2. scheme 处理：`clan://` → `http://ip:port/file/...`；`assets://` → APK assets；
   `content://`/`file://` → 本地；无 scheme 时补 `http://`。
3. **解密顺序（实现必须按此顺序容错）**：
   - 已是合法 JSON → 原样使用；
   - 命中 `[A-Za-z0-9]{8}\*\*` 标记 → 截断标记后 Base64 解码；
   - 以 `2423` 开头 → 专用 CBC：`"2423"(4) + … + "2324"(4) + hex + 16 字节 key("$#…#$") + … + iv(末尾 13 字符)`，全部 `toLowerCase()` 后 `AES-CBC`；
   - 有 `;pk;` 密钥且仍非 JSON → `AES-ECB(content, key)`，key 右补 `0` 到 16 字节。
4. `urls` 多仓：取首条**递归**解析（深度 ≤8 防循环）；`rules`/`headers`/`proxy`/`doh` 里出现的
   **字符串**会被当作外部 JSON 文件再拉取并合并（`ConfigCompat.java:37-56`）。

### 3.2 `spider` 字段与 jar 加载

```
"spider": "./jar/jinenge.jar;md5;9cc29f6286b2fe7910628852929c4bdb"
"spider": "./lib/jinenge.jar;md5;1d7a5147033044a81f91d5f4a510f9ed"
"spider": "../jar/custom_spider.jar;md5;<md5>"
```

- 三段式 `路径;md5;摘要`：客户端按 `;` 分割，**用 md5 校验本地缓存**，不一致则重新下载。
- 相对路径（`./`、`../`）以**配置文件自身的 URL/目录**为基准解析（`URI.resolve` 语义）。
- `jar` 文件实际是 **Android dex**：两个参考仓库的 `jar/*.jar` 解开后只有一个 `classes.dex`
  （`unzip -l` 可见 `classes.dex` 1.2–2.3 MB）。客户端用 `DexClassLoader` 加载，**不是**标准 `URLClassLoader`。
- 站点级 `jar` 字段（如 `"jar": "./jar/通用.jar;md5;f2e335a610902ad385828c2e67ad884a"`）会为该站点单独加载/校验一个包。

### 3.3 `sites[]` 字段全表

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `key` | string | **必填** | 站点唯一标识，用于历史/收藏/Local 隔离 |
| `name` | string | **必填** | 显示名称 |
| `type` | int | **必填** | 站点协议类型，见 §3.4 |
| `api` | string | **必填** | 接口地址或爬虫类名 |
| `searchable` | int | `1` | 是否可搜索 |
| `quickSearch` | int | `1` | 是否参与快速搜索（跨站联想） |
| `filterable` | int | `1` | 是否启用分类筛选 |
| `playUrl` | string | `""` | 站点级解析地址（覆盖默认解析） |
| `ext` | string \| object | `""` | 扩展参数，原样传给爬虫；可为本地/远程文件路径 |
| `categories` | string[] | `[]` | 采集站的分类快捷列表 |
| `playerType` | int \| string | `-1` | 播放器内核：0 系统 / 1 IJK / 2 Exo |
| `timeout` | int | — | 站点请求超时（秒），M3 **钳制到 5~60，默认 15**（`SourceBean.getTimeout()`：`timeout > 0 ? max(5, min(60, timeout)) : 15`） |
| `indexs` | int | — | 站点在首页的排序权重 |
| `changeable` | int | `1` | 是否允许「切源」 |
| `style` | object | — | `{"type":"rect\|oval\|list","ratio":0.75}` 列表样式；M3 另用 `{"ratio","type"}` **控制网格列数** |
| `jar` | string | — | 站点级爬虫包（`type=3` 时用**这个** jar 而非顶层 `spider`；取值协议见 §4.3.2.1） |
| `lang` | string | — | 搜索语言提示（新一代） |
| `click` | string | — | 网页点击规则，格式 `URL片段;JS代码`，后半段是**任意 JS**（见 §5.7） |

> `playerType` 的取值来自 `HawkConfig.PLAY_TYPE` 注释 `//0 系统 1 ijk 2 exo`
> （`com/github/tvbox/osc/util/HawkConfig.java`）。完整取值：
> `-1` 跟随全局设置、`0` 系统 MediaPlayer、`1` IJK、`2` ExoPlayer、`10–14` 外部播放器（MX/其它）。
> 注意参考仓库里 `"playerType": "2"` 与 `"playerType": 2` **字符串与数字混用**，第三方实现需两者都接受。
>
> **`playerType` 选的是播放器，不是解析器**——不要与 `parses[].type` 混淆。
>
> `site.playUrl` 除了解析地址前缀，还承载两个**指令前缀**：`json:<接口>`（JSON 解析）与
> `parse:<解析器名>`（指定解析器）。`playUrl` 是**无分隔符前缀**，直接拼在播放 URL 前
> （`Result.getRealUrl()` = `playUrl + url`）。

### 3.4 `type` 的取值语义（关键）

源码注释与分发逻辑（`bean/SourceBean.java:9`、`viewmodel/SourceViewModel.java`）：

| type | 含义 | 处理类 | `api` 形态 |
| --- | --- | --- | --- |
| `0` | **XML 采集站**（MacCMS XML，`ac=videolist`） | `AbsXml` | `http://…/api.php/provide/vod` |
| `1` | **JSON 采集站**（MacCMS JSON，`ac=detail`） | `AbsJson` | `http://…/api.php/provide/vod` |
| `2` | engine 专有的 detail 风格采集（classic 客户端直接返回 null，不要依赖） | — | 同 0/1 |
| `3` | **爬虫**（Spider） | `JarLoader`/`JsLoader` | `csp_Xxx` 或 `./js/x.js` 或 `http://…` |
| `4` | HTTP JSON API（新一代，`/play` 同构） | HTTP 客户端 | `http://…` |
| `5` | 部分实现为「聚合嗅探」 | — | — |

> **重要**：`type` 只决定**请求参数与分发路径**。客户端解析响应时实际按**内容嗅探** XML/JSON
> （`Result.fromType`），不按 `type` 取值——接口返回 XML 还是 JSON 与写 0 还是 1 无关。

`type=0/1` 时的请求规则（`SourceViewModel` 源码逐字）：

| 操作 | 请求 |
| --- | --- |
| 分类列表 | `GET {api}?ac=videolist\|detail&t={type_id}&pg={page}`；`type=1` 额外 `&f={JSON(extend)}`（筛选项），`type=4` 用 `ext=base64` |
| 详情 | `GET {api}?ac=videolist\|detail&ids={id1,id2}`（多个 id 用逗号） |
| 搜索 | `GET {api}?wd={关键词}`，`type=1` 时附加 `&ac=detail` |
| 补图 | `GET {api}?ac=…&ids=a,b,c` |

> 注意 `ac` 的取值：`type=0` 用 `videolist`，`type=1` 用 `detail`；**搜索时 type=1 也用 `ac=detail`**。

### 3.5 `parses[]` 与 `flags`

`ParseBean`（`bean/ParseBean.java`）：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `name` | string | **必填** | 解析名称 |
| `url` | string | **必填** | 解析地址；`proxy://` 前缀会被替换成本地代理地址 |
| `type` | int | `0` | `0` 普通嗅探 ／ `1` json ／ `2` Json 扩展 ／ `3` 聚合 ／ `4` 自动（客户端插入） |
| `ext` | object | `{}` | 必须是 JSON **对象**；`{"flag":["qiyi","youku"]}` 限定生效平台 |
| `header` | object | — | 请求头 |
| `click` | string | — | WebView 点击规则 |

**`url` 是前缀拼接，没有占位符**：`parses[].url` **不做** `{xx}`/`@` 模板替换，而是把目标视频地址
直接拼在后面。若 `url` 含 `?` 且配了 `ext`，客户端会追加
`&cat_ext=<URL_SAFE_BASE64(ext)>`（`ParseJob.java:351-365`）。

**`flags` 的准确语义**：顶层 `flags` 是**字符串数组**（VIP 关键字），只有三处用途：

1. 决定 `Result.isUseParse()`（是否走 VIP 解析）；
2. 过滤可用解析器（命中为空则退回全部解析器）；
3. 作为 `vipFlags` 参数传给爬虫的 `playerContent(flag, id, vipFlags)`。

> ⚠️ **对象型 `flags`（`[{"name","show","urls","delay","headers"}]`）在三份源码中都不存在**——
> 那是部分衍生版的私有扩展。客户端内部另有一个同名类 `Flag`，但它是**播放线路对象**
> （`flag/show/urls/episodes`），与配置顶层的 `flags` 无关。

### 3.6 `rules` / `ads` / `hosts` / `doh` / `ijk`

```jsonc
"rules": [
  {"host": "api.52wyb.com", "rule": ["m3u8?pt=m3u8"]},
  {"host": "www.maolvys.com", "rule": ["document.getElementsByClassName('swal-button')[0].click()"]}
],
"ads": ["static-mozai.4gtv.tv", "s3t3d2y8.afcdn.net"],
"hosts": ["img1.wsyzy.org=1.2.3.4"],
"doh": [
  {"name": "Google", "url": "https://dns.google/dns-query", "ips": ["8.8.4.4", "8.8.8.8"]},
  {"name": "Cloudflare", "url": "https://cloudflare-dns.com/dns-query",
   "ips": ["1.1.1.1", "1.0.0.1", "2606:4700:4700::1111"]}
]
```

#### `rules`（两代结构并存，实现必须都容错）

**(a) app 旧结构**（`ApiConfig.java:319-362`，匹配器 `util/VideoParseRuler.java`）

```jsonc
[{"host": "vip.lz", "rule": ["regex1", "regex2"], "filter": ["regexX"]},
 {"hosts": ["vip.lz", "hd.lz"], "regex": ["#EXT-X-DISCONTINUITY[\\s\\S]*"]}]
```

- `rule`（或 `hosts`+`regex`）是**白名单**：URL 必须**同时命中该组内所有正则**才算视频
  （`VideoParseRuler.checkVideoForOneHostRules`）。
- `filter` 是**黑名单**：命中即丢弃该请求。
- host 匹配：先按页面 URL 的 host 找规则，找不到再用 `"*"`。

**(b) engine 新结构**（`engine/core/.../bean/Rule.java`）

```jsonc
[{"name": "抖音嗅探", "hosts": ["douyin.com"], "regex": ["is_play_url="],
  "exclude": ["/ad/"], "script": ["document.querySelector('.play').click()"]}]
```

- 只按**第一个命中的 rule** 生效（`Sniffer.getRule`）；
  host 匹配范围 = 页面 host + query 参数 `url=` 的 host，用「包含或正则」。
- `exclude` 命中 → 不是视频；`regex` 命中 → 是视频；都不中 → 落到通用后缀正则。
- `script`：页面加载完成后依次 `evaluateJavascript`。
- VOD 与 LIVE 的 rules 会合并（`RuleConfig.merge`）。

#### `ads`

- 类型 `array<string>`，元素是**域名或域名片段**（不是正则）。
- 匹配 `url.toLowerCase().contains(adHost)`；命中后返回空 `WebResourceResponse`
  （`text/plain`，空 body）。
- 内置默认 57 条（`ApiConfig.java:364` 的 `defaultIJKADS`），**仅当列表为空时**注入，再追加配置项。

#### `hosts`

- `array<string>`，每项 `域名=IP`，`OkDns.addAll` 直接拆 `=` 入表。
- 查找：精确命中优先，其次「包含或正则」，找不到返回原 hostname。
- **它不是 hosts 文件，是 DNS 覆盖表**（用于图片 CDN 加速/防劫持）。

#### `doh`

- 模型 `{name, url, ips[]}`；内置候选 `System`（空）/`Tencent`(`https://doh.pub/dns-query`)/
  `Alibaba`(`https://dns.alidns.com/dns-query`)/`360`(`https://doh.360.cn/dns-query`)。
- **`ips` 只为解析 DoH 服务器自身域名做 bootstrap**，不是给业务域名用的。
- ⚠️ **实现缺口**：本 fork 的 `doh` 数组虽然被解析并合并进候选列表（`VodConfig.getDoh()`），
  但实际 DNS 走的是**用户设置**（`OkGoHelper.updateDns`），配置里的 `doh` 并未接到 OkDns。
  第三方实现可以选择真正接上（更符合配置意图），但要知道原版行为。

#### `ijk`

`[{"group":"解码器分组","options":[{"category":"…","name":"…","value":"…"}]}]`，
客户端按 `category|name` 作为键组装 IJK 播放器选项。内置默认两组（软解码/硬解码各 15 个选项）。

### 3.7 `wallpaper`

`SourceDescriptor.wallpapers()`（重构版 `util/SourceDescriptor.java`）支持三种形态，并统一用
`URI.resolve` 相对配置地址解析：

```jsonc
"wallpaper": "https://api.likepoems.com/img/bing"                    // 单个
"wallpaper": "https://a.com/1.jpg,https://a.com/2.jpg"               // 逗号分隔
"wallpaper": ["https://a.com/1.jpg", {"url": "https://a.com/2.jpg"}] // 数组/对象数组
```

**加载算法**（`app/.../util/WallpaperManager.java`）：

1. 取值来源：`follow://subscription`（跟随订阅）或具体 URL；`drawable://<名字>` 为内置渐变图。
2. 缓存：`filesDir/wallpapers/<md5(url)>.wp`，命中且能解码则直接用。
3. 下载：独立 OkHttp，连接 4s / 读 6s / 整次 8s，`User-Agent: okhttp/3.15`，总超时 10s 放弃。
4. 校验：`BitmapFactory` 只解 bounds，`outWidth/outHeight > 0` 才算有效图；单文件上限 32MB。
5. **响应不是图片时**：把响应体当配置文本 → 走 §3.1.1 的解密 → `SourceDescriptor.wallpapers()`
   取第一张再下载（**递归 ≤3 层**）。这就是「随机图 API / JSON 壁纸接口」的兼容方式。
   注意：原版**没有**「从 HTML 里正则抓 `<img>`」的实现。
6. 展示：Glide 按屏幕尺寸 `centerCrop`，再叠一层纯色遮罩（softness 0..80）。
7. 失败源记入黑名单，同一 URL 不再自动重试。
8. 在线随机图内置项：`https://picsum.photos/1280/720`、`https://www.dmoe.cc/random.php`。
9. engine 侧还有一套「壁纸即媒体」（`WallConfig`）：按内容判断 GIF/视频/静态图，支持视频壁纸。

### 3.8 相对路径解析规则

所有相对路径（`./js/x.js`、`./json/x.json`、`./tvlive/tvlive.txt`、`../jar/x.jar`）都相对
**配置地址自身**解析。`SourceDescriptor.resolve(base, value)` 的实现细节：先用 `URI.resolve`，
并把 `{`/`}` 临时转义成 `%7B`/`%7D` 再还原，以免 URL 模板花括号被 URI 规范化破坏。

客户端的路径解析白名单（`ConfigPaths.resolve`，由 `Decoder.fix()` 在配置下载后立即执行）：
`spider`、`jar`、`api`、`ext`、`url`、`sourceUrl`、`playUrl`、`wallpaper`、`epg`、`logo`。
**只有以 `./`、`../`、`/` 开头的值才被解析**；`header` 键下的值**不**递归（避免 UA 里的 `./` 被误改）。

**`sites[].jar` 的取值协议**（M3 `JarLoader` 支持的全部前缀，见 §4.3.2.1）：
`http(s)://`、`assets://`/`assets/`、`file:/`、`clan://localhost/…`、`clan://<host>/…`。
其中 **`clan://` 是 TVBox 私有的「经本地/局域网 HTTP 服务取文件」协议**，
会被改写成 `http://<host>/file/<path>`，因此依赖 §8.2 本地服务的 `/file` 路由。

### 3.9 多仓订阅（Depot）

配置顶层出现 `urls` 时，客户端把它当作「配置的配置」：

```json
{"urls": [
  {"url": "https://example.com/a.json", "name": "线路A"},
  {"url": "https://example.com/b.json", "name": "线路B"}
]}
```

- 客户端按顺序尝试加载，**取第一个可加载的配置**并删除原订阅（`VodConfig.checkJson` → `parseDepot`）。
- 参考仓库 `json/xianlu.json` 就是这种格式（8 条线路，其中 2 条 url 实际是广告文字）。

### 3.10 官方最小配置示例

```jsonc
{
  "spider": "./jar/custom_spider.jar;md5;1d7a5147033044a81f91d5f4a510f9ed",
  "wallpaper": "https://api.likepoems.com/img/bing",

  "sites": [
    {
      "key": "zy_xiaomaomi",
      "name": "小猫咪",
      "type": 1,                                   // 1 = JSON 采集站
      "api": "http://zy.xiaomaomi.cc/api.php/provide/vod/",
      "searchable": 1, "quickSearch": 1, "filterable": 0,
      "categories": ["综艺", "动漫", "动作片", "国产剧"]
    },
    {
      "key": "alist",
      "name": "Alist 网盘",
      "type": 3,
      "api": "csp_AList",                          // 3 = JAR 爬虫
      "searchable": 1, "quickSearch": 1, "filterable": 1,
      "ext": "./json/alist.json"
    },
    {
      "key": "douban_hot",
      "name": "热门推荐",
      "type": 3,
      "api": "./js/通用api数据.js",                 // 3 = JS 源（模板）
      "ext": "./js/豆瓣推荐.js",                    // 数据（rule 对象）
      "searchable": 0, "quickSearch": 0, "filterable": 0
    }
  ],

  "lives": [
    {
      "name": "live",
      "type": 0,                                  // 0 = txt
      "url": "./tvlive/tvlive.txt",
      "playerType": 1,
      "epg": "http://epg.112114.xyz/?ch={name}&date={date}",
      "logo": "https://epg.112114.xyz/logo/{name}.png"
    }
  ],

  "parses": [
    {"name": "Json聚合", "type": 1, "url": "http://api.parline.top/json/?url=", "ext": {"flag": ["qiyi"]}},
    {"name": "普通嗅探", "type": 0, "url": "https://www.kxyjs.com/?url="}
  ],

  "flags": ["qiyi", "imgo", "youku", "mgtv"],

  "rules": [{"host": "*", "rule": ["m3u8?pt=m3u8"]}],
  "ads": ["ad.example.com"],
  "doh": [{"name": "Google", "url": "https://dns.google/dns-query", "ips": ["8.8.8.8"]}],

  "ijk": [
    {"group": "软解码", "options": [
      {"category": "播放器选项", "name": "mediacodec", "value": "0"},
      {"category": "播放器选项", "name": "mediacodec-auto-rotate", "value": "1"}
    ]}
  ]
}
```

---

## 4. 站点源协议

### 4.1 `type` 分发与优先级

客户端按 `api` 字符串特征选择加载器（`BaseLoader.getSpider`，`engine/core/.../loader/BaseLoader.java:39-66`）：

```java
private static boolean isJs(String api)  { return api.contains(".js"); }
private static boolean isPy(String api)  { return api.contains(".py"); }
private static boolean isCsp(String api) { return api.startsWith("csp_"); }

public synchronized Spider getSpider(String key, String api, String ext, String jar) {
    if (NodeLoader.accepts(api)) return nodeLoader.getSpider(key, api, ext);
    else if (isPy(api))         return pyLoader.getSpider(key, api, ext);
    else if (isJs(api))         return jsLoader.getSpider(key, api, ext, jar);
    else if (isCsp(api))        return jarLoader.getSpider(key, api, ext, jar);
    else                        return new SpiderNull();
}
```

**判定优先级**：`nodejs:`/`node:`/`.cjs`/`.mjs` → `.py` → `.js`（`contains`）→ `csp_` → `SpiderNull`（空实现，所有方法返回 `""`）。

| type | 协议 | 说明 |
| --- | --- | --- |
| `0` | MacCMS **XML** 采集站 | §4.2 |
| `1` | MacCMS **JSON** 采集站 | §4.2 |
| `2` | 预留（部分实现为本地/推流） | — |
| `3` | 爬虫：`csp_*`（JAR）／`.js`（QuickJS）／`.py`／HTTP API | §4.3–4.6 |
| `4` | HTTP API（`/play` 同构 JSON，新一代） | §4.6 |
| `5` | 部分实现为聚合嗅探 | — |

> `isJs` 用 `contains(".js")`，所以 `./lib/drpy2.min.js`、`https://.../xxx.js?module=./lib` 都会走 JS 引擎。
> 相对路径（`./js/x.js`）相对**配置地址**解析。

### 4.2 type=0/1：MacCMS 采集站协议

这是覆盖面最广的协议（苹果 CMS / MacCMS 10 的 `api.php/provide/vod` 接口）。
两个参考仓库里共有约 15 个此类站点，例如
`http://zy.xiaomaomi.cc/api.php/provide/vod/`、`http://vipmv.cc/api.php/provide/vod/`、
`https://cj.vodimg.top/api.php/provide/vod/`、`http://anltv.cn/api.php/provide/vod/`。

#### 4.2.1 请求规则

| 操作 | 请求 |
| --- | --- |
| 分类列表 | `GET {api}?ac=videolist\|detail&t={type_id}&pg={page}` |
| 详情 | `GET {api}?ac=videolist\|detail&ids={id1,id2}`（多个 id 用逗号） |
| 搜索 | `GET {api}?wd={关键词}`，`type=1` 时附加 `&ac=detail` |

`ac` 的取值：`type=0` → `videolist`，`type=1` → `detail`（源码 `SourceViewModel.java:203-205,287-288,395-396`）。

#### 4.2.2 XML 返回格式（type=0）

源码依据：`bean/AbsXml.java`（`@XStreamAlias("rss")`）、`bean/Movie.java`。

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="5.1">
  <list page="1" pagecount="12" pagesize="20" recordcount="235">
    <video>
      <last>2024-01-01 12:00:00</last>
      <id>12345</id>
      <tid>1</tid>
      <name><![CDATA[影片名称]]></name>
      <type>动作片</type>
      <pic>https://img.example.com/cover.jpg</pic>
      <lang>国语</lang>
      <area>内地</area>
      <year>2023</year>
      <state>正片</state>
      <note><![CDATA[共40集]]></note>
      <actor><![CDATA[张三,李四]]></actor>
      <director><![CDATA[王五]]></director>
      <dl>
        <dd flag="zuidam3u8"><![CDATA[第01集$http://v.example.com/1/index.m3u8#第02集$http://v.example.com/2/index.m3u8]]></dd>
        <dd flag="zuidaall"><![CDATA[第01集$http://v.example.com/1.mp4#第02集$http://v.example.com/2.mp4]]></dd>
      </dl>
      <des><![CDATA[剧情简介]]></des>
    </video>
  </list>
  <class>
    <ty id="1">动作片</ty>
    <ty id="2">喜剧片</ty>
  </class>
</rss>
```

字段表（`Movie.java` 逐字段）：

| 节点 | 说明 |
| --- | --- |
| `<list>` 属性 `page`/`pagecount`/`pagesize`/`recordcount` | 分页信息 |
| `<video><last>` | 最后更新时间 |
| `<id>` | 内容 ID（详情/播放时回传） |
| `<tid>` | 父级分类 ID |
| `<name>`/`<type>`/`<pic>`/`<lang>`/`<area>`/`<year>`/`<state>`/`<note>` | 名称/类型/封面/语言/地区/年份/状态/集数备注 |
| `<actor>`/`<director>`/`<des>` | 演员/导演/简介 |
| `<dl><dd flag="...">` | **`flag` 是 `dd` 的属性**（播放线路名），文本内容是剧集串 |

**剧集串格式（硬约束）**：`dd` 的文本 = `第01集$url#第02集$url`，即
`剧集名$播放地址`，集与集用 `#` 分隔；`dd` 的 `flag` 属性即线路名。

#### 4.2.3 JSON 返回格式（type=1）

字段名与 XML 一致（下划线风格），外层为：

```json
{
  "code": 1,
  "msg": "数据列表列表成功",
  "page": 1,
  "pagecount": 12,
  "limit": "20",
  "total": 235,
  "list": [
    {
      "vod_id": 12345,
      "vod_name": "影片名称",
      "type_id": 1,
      "type_name": "动作片",
      "vod_pic": "https://img.example.com/cover.jpg",
      "vod_lang": "国语",
      "vod_area": "内地",
      "vod_year": "2023",
      "vod_state": "正片",
      "vod_remarks": "共40集",
      "vod_actor": "张三",
      "vod_director": "王五",
      "vod_content": "剧情简介",
      "vod_play_from": "zuidam3u8$$$zuidaall",
      "vod_play_url": "第01集$http://v/1.m3u8#第02集$http://v/2.m3u8$$$第01集$http://v/1.mp4"
    }
  ],
  "class": [{"type_id": 1, "type_name": "动作片"}]
}
```

> 采集站的 JSON 变体在不同 CMS 版本间字段名略有差异（`vod_id` vs `id`、`type_id` vs `tid`），
> 第三方实现需做双向兼容。XML 的 `<dl><dd flag>` 在 JSON 里等价于 `vod_play_from` + `vod_play_url`。

#### 4.2.4 `categories` 字段

站点对象里的 `"categories": ["综艺","动漫","动作片",...]` 是**客户端 UI 的快捷分类标签**，
不影响请求；真正决定请求的是用户点击的分类 `type_id`。

### 4.3 type=3 + `csp_*`：JAR(Dex) 蜘蛛协议

#### 4.3.1 类名映射（精确规则）

```java
spider = (Spider) loader.loadClass("com.github.catvod.spider." + api.split("csp_")[1]).newInstance();
spider.prepare(key);
spider.init(App.get(), ext);
```

- 类名 = `"com.github.catvod.spider." + api.split("csp_")[1]` —— **去掉 `csp_` 后原样拼接，不做大小写转换**。
  `csp_AList` → `com.github.catvod.spider.AList`；写成 `csp_Alist` 会 `ClassNotFoundException`。
- `api.split("csp_")[1]` 取 `csp_` **之后**整段，所以 `xx_csp_Foo` 也会解析成 `Foo`。
- 类必须继承 `com.github.catvod.crawler.Spider` 且有 **public 无参构造**。
- 实例缓存 key = `md5(jar) + siteKey`，同一 jar 内不同站点各一个实例。

#### 4.3.2 jar 加载（`路径;md5;校验值`）

```java
String[] texts = jar.split(";md5;");
String md5 = texts.length > 1 ? texts[1].trim() : "";
if (md5.startsWith("http")) md5 = OkHttp.string(md5).trim();   // md5 也可以是 URL
jar = texts[0];
if (!md5.isEmpty() && Crypto.equals(Path.jar(jar), md5)) { load(key, Path.jar(jar)); }   // 缓存命中
else if (jar.startsWith("http")) { load(key, Download.create(jar, Path.jar(jar)).get()); } // 远程下载
else if (jar.startsWith("file"))  { load(key, Path.local(jar)); }                          // 本地文件
```

- 本地缓存路径 = `<App cacheDir>/jar/<md5(原始路径字符串)>.jar`。
- **md5 不一致不报错**：直接走远程重新下载或本地加载分支 —— md5 只用于判断缓存可复用性，**不是安全校验**。
- `assets://` 开头的 jar 被改写成 `http://127.0.0.1:<port>/...` 走本地 HTTP 服务。
- 加载用 `DexClassLoader(dexPath, optimizedDir, librarySearchPath, parent)`，优化目录与 so 目录均为 `<cache>/jar`。
- 加载后**自动反射调用**两个可选的静态入口：
  - `com.github.catvod.spider.Init.init(Context)`（**静态**）
  - `com.github.catvod.spider.Proxy.proxy(Map)`（**静态**，登记为该 jar 的 proxy 入口）
  两者缺失都被 `catch Throwable` 吞掉。

**加载失败降级**

| 场景 | 行为 |
| --- | --- |
| 文件不存在 / `setReadable()` 失败 | 直接返回，不登记 loader |
| 远程下载失败 | 抛 `IllegalStateException("JAR 来源初始化失败，可重试")` |
| 构造 / `init` 抛错 | 销毁实例 + `releaseNetwork()`，再抛同上异常 |
| `api` 非 `csp_`/`.js`/`.py`/node | 返回 `SpiderNull`（全部方法返回 `""`） |

#### 4.3.2.1 `jar` 字段的五种来源协议（M3 `JarLoader` 实测）

TVBoxOS-M3 的 `JarLoader.parseJar` 支持**五种** jar 寻址方式，第三方实现必须都认：

| 前缀 | 解析为 | 说明 |
| --- | --- | --- |
| `http(s)://` | 直接下载到 `<cache>/jar/<key>.jar` | 常规远程 jar |
| `assets://` 或 `assets/` | 从 APK `assets/` 读出后落盘 | 内置 jar；`copyAsset` 去掉前缀再 `Assets.open` |
| `file:/` | `Environment.getExternalStorageDirectory()` + 去前缀路径；不存在则按原样路径 | 本地绝对/相对路径 |
| **`clan://localhost/<path>`** | `http://127.0.0.1:<port>/file/<path>` | **经本地 HTTP 服务取文件** |
| **`clan://<host>/<path>`** | `http://<host>/file/<path>` | 经局域网另一台设备的 HTTP 服务取文件 |
| 其它（含相对路径） | 当作本地路径 | 需先按 §3.8 相对配置 URL 解析 |

**md5 与缓存判定顺序**（`parseJar`，严格按序）：

```java
String[] texts = jar.split(";md5;");          // 固定三段字面量 ;md5;
if (texts.length > 1) { source = texts[0]; md5 = texts[1].trim(); }
aliases.put(jarKey(source), key);             // 记录 真实key → 别名key
if (md5.startsWith("http")) md5 = OkHttp.string(md5, null).trim();   // md5 段也可以是 URL

if (!md5.isEmpty() && exists(file) && MD5.getFileMd5(file).equalsIgnoreCase(md5))
        load(key, file);                      // ① 缓存 md5 命中
else if (md5.isEmpty() && exists(file) && !FileUtils.isWeekAgo(file))
        load(key, file);                      // ② 无 md5 但缓存存在且**不超过一周**
else if (source.startsWith("http"))  load(key, download(source, file));   // ③ 下载
else if (source.startsWith("assets")) load(key, copyAsset(source, file)); // ④ 资产拷贝
else if (source.startsWith("file"))   load(key, local(source));           // ⑤ 本地
else if (source.startsWith("clan://")) load(key, download(clanToAddress(source), file)); // ⑥ clan
```

- 缓存文件名 = `MD5(原始 jar 字符串)`（不是 md5 段的值），即同一 jar 地址恒定同一缓存文件。
- **分支 ② 的「一周」是硬规则**：无 md5 时，超过一周的缓存会被视为过期从而走下载——
  这是为了让「会变的 jar」能自动刷新。第三方实现若不做时间判断，会永远用旧 jar。
- `download` 用 16 KiB 缓冲、检查 `Thread.interrupted()`；`copyAsset` 同样 16 KiB。
- `file.setReadOnly()` 在构造 `DexClassLoader` 之前调用。

#### 4.3.2.2 多 jar 架构与 `site.jar`

M3 支持**每个站点指定自己的 jar**（配置 `sites[].jar`）：

| 键 | 含义 |
| --- | --- |
| `MAIN_KEY = "main"` | 顶层 `spider` 字段指向的主 jar |
| `jarKey(jar) = MD5(jar字符串)` | 站点级 jar 的 key |
| `aliases` | `jarKey(source)` → 调用方给的别名 key（`setRecentJarKey`/`loadLiveJar` 用） |
| `spiders` | `spKey = jarKey + siteKey` → `Spider` 实例（**缓存**，同站点复用） |
| `proxyMethods` | jarKey → `com.github.catvod.spider.Proxy.proxy(Map)` 静态方法 |
| `recent` | 最近使用的 jarKey，`searchDanmuUi` / `jsonExt` 等无 key 调用都落到它 |

- `getSpider(key, api, ext, jar)`：`jar` 为空 → 用 `MAIN_KEY`；否则 `parseJar` 该 jar。
  取实例时 `loader.loadClass("com.github.catvod.spider." + className(api)).newInstance()`。
- **`className(api)` = `api.contains("csp_") ? api.split("csp_")[1] : api`**——
  即 `csp_X` 取 `X`，非 `csp_` 前缀的 `api` **原样当类名**（可用于直接写全类名）。
- 实例化后依次：`spider.siteKey = key` → `spider.initApi(new SpiderApi())` →
  `spider.init(App.getInstance(), ext)`。**`initApi` 是注入 `SpiderApi` 的入口**（§4.3.3.1）。
- 任一步抛错 → 返回 `SpiderNull`（不崩 UI）。

#### 4.3.2.3 jar 内可选的四个静态入口（比官方文档多两个）

除 §4.3.2 列出的 `Init.init(Context)` 与 `Proxy.proxy(Map)` 外，M3 还反射查找：

| 类 | 方法 | 用途 |
| --- | --- | --- |
| `com.github.catvod.spider.Danmaku` | `static onClick(String name, String episode)` | jar 提供**弹幕搜索 UI**（单击） |
| `com.github.catvod.spider.Danmaku` | `static onLongClick(String name, String episode)` | 同上（长按） |
| `com.github.catvod.parser.Json{key}` | `static parse(LinkedHashMap<String,String>, String url)` → `JSONObject` | `parses[].type=2` 的 JSON 扩展 |
| `com.github.catvod.parser.Mix{key}` | `static parse(LinkedHashMap, String url, String name, String flag)` → `JSONObject` | `parses[].type=3` 的聚合扩展 |

- `searchDanmuUi(name, episode, longClick)`：按 `recent` jar 取方法，取不到退到 `"main"`，再取不到静默返回。
  `hasDanmuSearchUi()` 供 UI 决定是否显示弹幕搜索入口。
- `jsonExt` / `jsonExtMix` 的类名查找顺序：`recent` loader → `MAIN_KEY` loader，都找不到抛
  `ClassNotFoundException`（被 catch 成返回 `null`）。

#### 4.3.2.4 端口注入与 `ProtectedInitJar`（反逆向）

**端口注入**（每次切 jar / 起服务都要做）：

```java
com.github.catvod.Proxy.set(getServerPort());                 // 宿主侧
Class<?> proxy = loader.loadClass("com.github.catvod.Proxy"); // jar 内同名类
proxy.getMethod("set", int.class).invoke(null, getServerPort());
```

`getServerPort()` 从 `ControlManager.getAddress(true)`（形如 `http://127.0.0.1:9978`）取末段数字，
失败回落 `RemoteServer.serverPort`。**这是爬虫能拼出 `proxy://` 地址的前提。**

**`ProtectedInitJar`**（`app/.../crawler/ProtectedInitJar.java`）是一个**纯静态 dex 分析器**，
用于判断 jar 是否带「包名校验 + 自杀」保护，从而决定加载前是否先绑定上下文：

```java
boolean check(String jar)  →  scan(jar, App.getInstance().getPackageName())
boolean init(Class<?> clz) →  反射 clz.getMethod("get").invoke(null) 拿单例
                               bindContext(clz, init)      // 注入 App 实例到字段 "c" 或任何 Context 型字段
                               bindDexLoader(clz, init)    // 从 com.github.catvod.spider.DexNative.getLoader(ctx)
                                                          // 取 DexClassLoader，注入到任何 DexClassLoader 型字段
                               invokeNoArg(clz, "replaceCloudDiskNames")
                               invokeStartGoProxy(clz)     // static startGoProxy(Context)
```

判定逻辑（`Dex.isProtected()`）：遍历 class_defs，找 `Lcom/github/catvod/spider/Init;`：

| 条件 | 结果 |
| --- | --- |
| 该类存在，且其 `init` 方法字节码里含**包名白名单字符串常量** | `isProtected()` 返回 **false**（走普通 `Init.init(Context)`，由 jar 自己校验并 `killProcess`） |
| 该类存在、含 `killProcess` 调用、且 `init` 里**无**白名单 | `isProtected()` 返回 **true**（宿主必须先绑定 Context/DexLoader 再放行） |

- 白名单匹配：`packageName.equals(value)`，或 value 是逗号分隔列表含该包名，
  或 value 是密文——**AES/CBC/PKCS5Padding，key = iv = `"1234123412341234"`**（16 字节 ASCII），
  Base64 解码后解密再匹配。
- `isCipherText` 判定：长度 ≥ 24、4 的倍数、`=` 只在末两位、全是 Base64 字符、解码后长度 % 16 == 0。
- dex 解析按固定偏移读 header：`string_ids_size@0x38`、`string_ids_off@0x3c`、
  `type_ids_size@0x40`、`type_ids_off@0x44`、`method_ids_size@0x58`、`method_ids_off@0x5c`、
  `class_defs_size@0x60`、`class_defs_off@0x64`；`class_def` 每项 32 字节，`class_data_off` 在 +24。
- 指令识别：`const-string` 操作码 `0x1a`（字符串索引 usize @+2）与 `0x1b`（@+4）；
  `invoke-*` 族 `0x6e–0x72`（方法索引 @+2）。
- `uleb128` 用于 `class_data` 的字段/方法计数差。

> **对第三方实现的意义**：这段代码说明「TVBox jar 生态里确实存在按包名授权的商业爬虫」。
> 你的客户端若加载这类 jar，会因包名不在白名单而被 jar 主动 `killProcess`——
> 唯一稳妥做法是换包名或不用该 jar，**不要**试图绕过（`ProtectedInitJar` 本身就是
> 给「无白名单的裸 killProcess jar」兜底用的，不是破解工具）。

#### 4.3.3 Spider 接口全量签名

运行时基类 `com.github.catvod.crawler.Spider`（客户端引擎侧）：

```java
public String siteKey;
public Net net;
public Local local;

public final void prepare(String key) { siteKey = key; net = new Net(key); local = new Local(key); }
public Activity getActivity();
public static Dns safeDns();
public static OkHttpClient client();

public void init(Context context) throws Exception { }
public void init(Context context, String extend) throws Exception { init(context); }
public String homeContent(boolean filter) throws Exception { return ""; }
public String homeVideoContent() throws Exception { return ""; }
public String categoryContent(String tid, String pg, boolean filter, HashMap<String,String> extend) throws Exception { return ""; }
public String detailContent(List<String> ids) throws Exception { return ""; }
public String searchContent(String key, boolean quick) throws Exception { return ""; }
public String searchContent(String key, boolean quick, String pg) throws Exception { return ""; }
public String playerContent(String flag, String id, List<String> vipFlags) throws Exception { return ""; }
public String liveContent(String url) throws Exception { return ""; }
public boolean manualVideoCheck() throws Exception { return false; }
public boolean isVideoFormat(String url) throws Exception { return false; }
public Object[] proxy(Map<String,String> params) throws Exception { return null; }
public String action(String action) throws Exception { return null; }
public void destroy() { }
```

编译用 SDK（`CatVodSpider/app/libs/catvod-api.jar`）额外提供：
`jin(utils.Js)`、`dialog(options[, callback])`、`closeDialog()`、`danmaku(id, emit)`、`proxyUrl([params[, local]])`、`danmakuUrl(id)`、`cancelByTag()`。
**这些只有在配套客户端也升级后才生效**，写爬虫时以 SDK-New 为准，但要知道运行时可能未实现。

##### 4.3.3.0 运行时基类的实现差异（M3 vs 官方 SDK）

同一个 `com.github.catvod.crawler.Spider` 类，**不同客户端编译进 dex 的版本字段类型不同**，
第三方实现加载存量 jar 时必须同时容错：

| 项 | 官方 SDK | TVBoxOS-M3 |
| --- | --- | --- |
| 返回序列化库 | Gson（`com.google.gson`） | **`org.json.JSONObject`**（`public static JSONObject empty`） |
| `init` 重载 | `init(Context)` / `init(Context, String)` | 同左 **+ `initApi(SpiderApi)`** |
| `proxy` | 直接 `Object[] proxy(Map)` | **`proxy(Map)` → `proxyLocal(Map)`** 双签名 |
| DNS | — | `static Dns safeDns()` → `OkHttp.dns()`（DoH 后的 Dns） |
| HTTP client | — | `static OkHttpClient client()` → `OkHttp.client()` |

**`proxy` / `proxyLocal` 双签名**（M3 `Spider.java:154-160`）：

```java
public Object[] proxyLocal(Map<String, String> params) { return null; }
public Object[] proxy(Map<String, String> params)    { return proxyLocal(params); }
```

宿主永远调 `proxy(...)`；爬虫覆写**任一个**都能生效。覆写 `proxyLocal` 的好处是宿主可以在
`proxy()` 外面包统计/限流。第三方客户端若要兼容两种存量 jar，应按同样方式实现
（宿主调 `proxy`，并同时准备 `proxyLocal` 的反射探测）。

**`initApi(SpiderApi)`**：`JarLoader.getSpider` 在 `spider.init(context, ext)` **之前**调用
`spider.initApi(new SpiderApi())`（§4.3.2.2）。所以爬虫若要调 `multiReq`/`webParse`，
应在 `initApi` 里保存该对象，而不是在 `init` 里找。

##### 4.3.3.1 `SpiderApi`：宿主反向注入给 JAR 爬虫的能力

TVBoxOS-M3 的 `com.github.catvod.crawler.SpiderApi` 是**爬虫反向调用宿主**的入口
（`app/src/main/java/com/github/catvod/crawler/SpiderApi.java`）。第三方客户端若想跑
调用了这些 API 的存量 JAR，必须实现同名同签名的方法：

```java
public String getAddress(boolean local);      // 本地代理根地址（ControlManager）
public String getPort();                      // 从 getAddress(true) 末段取端口
public void    log(String msg);               // → SpiderDebug.log
public int     getScreenOrientation();        // PORTRAIT / LANDSCAPE / REVERSE_LANDSCAPE / SENSOR_LANDSCAPE(异常默认)
public String  multiReq(JsonArray array);     // 并行批量 HTTP，返回 JsonArray 字符串
public String  webParse(String url, String flag);  // 返回 proxy:// 伪 URL 交给宿主解析
```

**`multiReq(JsonArray)`**——并发请求，**最多 6 线程**：

| 项 | 规则 |
| --- | --- |
| 线程数 | `Executors.newFixedThreadPool(Math.min(array.size(), 6))` |
| 每项 | `{"url","method","headers","data","postType"}`，非 JsonObject 项跳过 |
| `postType` | `"form"` 且 `data` 是对象 → `FormBody`；否则 `data` 原样（对象则 `toString()`） |
| 顺序 | 按输入顺序 `future.get()` 收集，**结果顺序与输入一致**（阻塞等待） |
| 结果 | `toResult(text)`：`{`/`[` 开头尝试 `JsonParser.parseString`，否则包成 `JsonPrimitive` 字符串 |
| 失败 | 任一项异常 → 整体返回 `""`（不是部分结果） |

**`webParse(url, flag)`**——把一个网页地址包装成宿主可解析的伪 URL：

```java
String encoded = Base64.encodeToString(url.getBytes("UTF-8"),
    Base64.DEFAULT | Base64.URL_SAFE | Base64.NO_WRAP);
return "proxy://go=SuperParse&flag=" + (flag == null ? "" : flag) + "&url=" + encoded;
```

即 **`proxy://go=SuperParse&flag=<flag>&url=<URL_SAFE_BASE64(url)>`**。
宿主见到 `proxy://go=SuperParse` 时：解码 `url`，用 `flag` 选解析线路/播放器，
走 WebView 嗅探或 `parses[]`。这是 JAR 蜘蛛「自己产不出直链时把活交还宿主」的标准协议。

**`SuperParse` 的完整链路**（M3 实测，四步）：

```
① 爬虫调 webParse(url, flag)
      ↓ 返回 proxy://go=SuperParse&flag=<flag>&url=<b64>
② DefaultConfig.checkReplaceProxy 把 proxy:// 重写成 /proxy?go=SuperParse
      ↓
③ Proxy.proxy() 命中 go 分支 → SuperParse.loadHtml()
      ↓
④ 返回一个「document.write 多个 <iframe>」的 HTML
```

第 ④ 步是关键：**一次返回的页面里并发放多个 `<iframe>`，每个 iframe 是一个 web 解析器，
谁先嗅到视频谁赢**（`SuperParse.java:155-205`）。这相当于把 `parses[]` 里所有
web 型解析器**并发**跑一遍，而不是串行尝试——对「哪个解析器能用不确定」的场景收益明显。
传给解析器的 flag 是 `parseFlag + "123"`（`parseFlag` 后固定拼接 `123`）。

第三方实现要兼容调用 `webParse` 的存量 JAR，必须实现这条链路；
若只实现「单个 WebView 串行试解析」，功能上等价但慢得多。

#### 4.3.4 客户端调用时序

```java
String home   = spider.homeContent(true);      // filter 固定 true
String video  = spider.homeVideoContent();
Result result = Result.fromJson(home);
List<Vod> list = Result.fromJson(video).getList();
if (!list.isEmpty()) result.setList(list);     // homeVideoContent 的 list 覆盖/合并
```

搜索分页：`page != "1"` 时调三参 `searchContent(key, quick, page)`，否则两参版本。

#### 4.3.5 返回 JSON 数据契约

| 接口 | 外层 JSON |
| --- | --- |
| `homeContent` | `{"class":[Class...], "filters":{"type_id":[Filter...]}, "list":[Vod...]?}` |
| `homeVideoContent` | `{"list":[Vod...]}` |
| `categoryContent` | `{"page","pagecount","limit","total","list":[...]}` |
| `detailContent` | `{"list":[Vod...]}` |
| `searchContent` | `{"list":[...],"page","pagecount","limit","total"}` |
| `action` | `{"msg":"..."}` / `{"web":{...}}` / `{}` |
| `liveContent` | TXT/M3U 文本或 `[{"name","channel":[{"name","urls":[...]}]}]` |

**Vod 字段**（`bean/Vod.java`）

| key | 说明 |
| --- | --- |
| `vod_id` | 作品 ID |
| `vod_name` / `type_name` | 名称 / 分类名 |
| `vod_pic` / `vod_remarks` / `vod_year` / `vod_area` | 封面 / 角标 / 年份 / 地区 |
| `vod_actor` / `vod_director` / `vod_content` | 演员 / 导演 / 简介 |
| `vod_play_from` | 线路名，多线路用 `$$$` 分隔 |
| `vod_play_url` | 剧集串：线路内 `#` 分隔，每集 `名称$播放值` |
| `vod_play_id` | 指定播放值（新 SDK；旧引擎可能不读） |
| `vod_tag` | `"folder"` = 文件夹卡片（点击进入下一级） |
| `action` | 卡片点击透传给 `action(action)` |
| `style` / `cate` | `{"type":"rect\|oval\|list","ratio":0.75}` |

**Class / Filter / Value**

| 对象 | 字段 |
| --- | --- |
| Class | `type_id`（作为 `categoryContent` 的 `tid`）、`type_name`、`type_flag`（`"1"`=文件夹型）、`land`/`circle`/`ratio` |
| Filter | `key`（回传时成为 `extend` 的 key）、`name`、`init`（默认值）、`value:[{n,v}]` |
| Value | `n`（显示名）、`v`（值） |

顶层 `filters` 的键必须等于某个 `class[].type_id`。

**播放附加对象**

| 对象 | 字段 |
| --- | --- |
| Sub（字幕） | `url`/`name`/`lang`/`format`（**MIME**，SDK 内由扩展名转换）/`flag`（1 默认选中，2 强制） |
| Danmaku | `name`/`url`；整个 `danmaku` 字段也允许是字符串 |
| Drm | `key`/`type`（`widevine`/`playready`/`clearkey`）/`forceKey`/`header` |
| SkipSegment | `type`（`opening`/`middle`/`ending`）/`start`/`end`（毫秒，`ending` 可省略 `end`） |
| Web | `url`/`mode`（`view`=独立内容）/`cookie:[{url,keys}]` |
| Style | `type`（`rect`/`oval`/`list`，缺省 `rect`）/`ratio`（oval 缺省 1.0，其他 0.75，上限 4） |
| Cate | `land`/`circle`/`ratio`（文件夹卡片） |

**分页契约**：返回 `list/page/pagecount/limit`，客户端以 `page < pagecount` 决定加载下一页。
用 SDK 的 `Response.page(items, page, limit)` 会**自动切片**并算 `pagecount`；
站点自身已分页时用 `Response.create().vods(items).page(page, pagecount, limit, total)`，**items 不要切片**，
`total` 只填精确总笔数，未知则不填。

### 4.4 type=3 + `.js`：QuickJS 原生 JS 源协议

#### 4.4.1 加载与模块契约

- JS 由**独立安装的 QuickJS 运行时模块 APK**（`RuntimeModule.QUICKJS`，QuickJS-NG 0.18.0）执行；
  同一站点 `key` 一个 Spider 实例，JS 上下文**单线程串行**。
- 入口：以 `api`（`./js/xxx.js` 或 URL）作为 ES Module 名执行。
- 宿主执行 `js/lib/spider.js`：

```js
import * as spider from '<api>'
if (!globalThis.__JS_SPIDER__) {
    if (spider.__jsEvalReturn) { globalThis.req = http; globalThis.__JS_SPIDER__ = spider.__jsEvalReturn(); }
    else if (spider.default)    { globalThis.__JS_SPIDER__ = typeof spider.default === 'function' ? spider.default() : spider.default; }
}
// home/homeVod/category/detail/search/play/live/action 的返回值若为对象/数组，自动 JSON.stringify
```

**两种导出形态二选一**：

| 形态 | 特征 |
| --- | --- |
| A. 原生 | `export default { init, home, ... }` 或 `export default class X extends Spider` |
| B. cat 风格（drpy 旧） | 源码含 `__jsEvalReturn`，调用它得到实例，并注入 `globalThis.req = http` |

`proxy`/`sniffer`/`isVideo`/`destroy` **不在**自动 stringify 列表里，返回值必须保持原生类型。

#### 4.4.2 模块导入解析

`Module.fetch(name)` 支持三种前缀，相对路径基于 `api` 的 URL 用 `UriUtil.resolve` 解析：

| 前缀 | 来源 |
| --- | --- |
| `http`/`https` | 网络拉取 |
| `assets://` | 宿主 assets（如 `assets://js/lib/cheerio.min.js`） |
| `lib/` | 宿主 `assets/js/lib/` |

#### 4.4.3 宿主注入的全局函数

**(a) HTTP（`js/lib/http.js`）**

```js
let req = (url, options) => http(url, Object.assign({ async: false }, options));   // 默认同步
function http(url, options = {}) { /* async:false → 同步；否则返回 Promise */ }
globalThis.page = function (items, pg, size = 20) { /* 前端分页 → {page,pagecount,limit,total,list} */ };
['global','window','self'].forEach(alias => 指向 globalThis);
```

`req(url, opts)` 同步返回 `{code, headers, content}`。

**(b) `Global.java` 反射注入（`@JSMethod`，以方法名注入全局）**

| JS 全局名 | 说明 |
| --- | --- |
| `s2t(text)` / `t2s(text)` | 简繁互转（`Trans.s2t/t2s(false, text)`，异常返回 `""`） |
| `getPort()` | 本地代理端口 |
| `getProxy(local)` | 返回 `http://ip:port/proxy?do=js` |
| `js2Proxy(dynamic, siteType, siteKey, url, headers)` | 拼代理 URL（`&from=catvod&siteType=&siteKey=&header=&url=`） |
| `setTimeout(fn, delay)` / `clearTimeout(id)` | 定时器 |
| `_http(url, options)` / `req(url, options)` | HTTP（后者同步） |
| `joinUrl(parent, child)` | URL 合并 |
| `md5X(text)` / `aesX(...)` / `desX(...)` / `rsaX(...)` | 加解密原生桥 |

**M3 `Global.java` 的权威签名**（`app/.../crawler/js/Global.java`，`@Function` 注解注册）：

```java
String getProxy(boolean local);
String js2Proxy(Boolean dynamic, Integer siteType, String siteKey, String url, JSObject headers);
String joinUrl(String parent, String child);
String pd(String html, String rule, String add_url);                 // 三参版 pdfh
String pdfh(String html, String rule);                               // = pd(html, rule, "")
JSArray pdfa(String html, String rule);                              // 多值
JSArray pdfla(String html, String p1, String list_text,
              String list_url, String add_url);                      // 列表聚合（海螺式）
String s2t(String text) / String t2s(String text);
String aesX(String mode, boolean encrypt, String input, boolean inBase64,
            String key, String iv, boolean outBase64);
String rsaX(String mode, boolean pub, boolean encrypt, String input,
            boolean inBase64, String key, boolean outBase64);
String rsaEncrypt(String data, String key);
String rsaEncrypt(String data, String key, JSObject options);        // options 形式
String rsaDecrypt(String encryptBase64Data, String key);
String rsaDecrypt(String encryptBase64Data, String key, JSObject options);
JSObject _http(String url, JSObject options);
void setTimeout(JSFunction func, Integer delay);
```

- **`_http` 的双态**：`options.complete` 存在 → 走 `Connect.to(url, req).enqueue(callback)`
  并**返回 `null`**（异步，回调在 executor 上执行）；不存在 → 退回同步 `req(url, options)`。
  第三方实现必须复刻这个「同一个函数按有无 callback 切换同步/异步」的行为。
- `setTimeout` 会 `func.hold()` 防 GC，到点在 `executor` 上 `func.call()`；
  `executor.isShutdown()` 时丢弃。
- RSA 的两种入参形式（`key` 字符串 / `key + options`）都要支持。
- `@ContextSetter` 的 `setJSContext(QuickJSContext)` 是**依赖注入**入口，
  宿主启动时调用它把 JS 运行时交回 `Global`（`runtime` 字段后续被 `toArray` 等使用）。
- `local` 类的方法名是 `get/set/delete`，其中 `delete` 是 Java 关键字，
  因此源里写作 `public void delete(String str, String str2)`（在 `.java` 里合法，
  但反射调用 `getMethod("delete")` 可行）。

**(c) `local`（双签名兼容，`js/lib/sdk.js` 包装）**

```js
globalThis.local = {
    get(...a)      { return a.length > 1 ? legacyLocal.get(...a) : decode(_sourceLocal('get', a[0])); },
    set(...a)      { return a.length > 2 ? legacyLocal.set(...a) : _sourceLocal('set', a[0], JSON.stringify(a[1])); },
    delete(...a)   { return a.length > 1 ? legacyLocal.delete(...a) : _sourceLocal('delete', a[0]); }
};
```

- 传 2/3 参 → 旧 Java `local(rule, key[, value])`，存储键 `cache_<rule>_<key>`，**全局共享不隔离**。
- 传 1/2 参 → 源级 `_sourceLocal(key)`，值自动 `JSON.stringify/parse`，**按站点隔离**。
  **JS 源应使用 1 参形式。**

**(d) `net` 对象（源级网络）**

```js
req, http, json, get, post, getCookie(url), setCookie(url, value),
batch(requests), download(url, file, options), sleep(ms), ws(url, options),
peek(key), cached(key, options, loader), refresh(...), clearCache(key),
connect(url, options, callback),   // WebSocket 长连，callback(socket, event)
session(), close()
```

返回值统一 `{"ok":true,"value":...}` / `{"ok":false,"error":...}`。

**(e) `pd`/`pdfh`/`pdfa`/`pdfl`（HTML 解析，来自 JAR 内的 `com.github.catvod.js.Function`）**

```java
global.setProperty("pd",    args -> pd((String)args[0], (String)args[1], (String)args[2]));
global.setProperty("pdfh",  args -> pdfh((String)args[0], (String)args[1]));
global.setProperty("pdfa",  args -> pdfa((String)args[0], (String)args[1]));
global.setProperty("pdfl",  args -> pdfl((String)args[0], (String)args[1], (String)args[2], (String)args[3], (String)args[4]));
```

- 基于 **Jsoup**。`pd` 会补全相对 URL，`pdfh` 取单选文本，`pdfa` 取多选数组。
- **这四个函数依赖站点配置了 `jar`**：`Function` 类从爬虫 jar 的 dex 里加载，
  站点没配 `jar` 时 JS 里没有这些函数（drpy 会降级或抛 `ReferenceError`）。

**(f) `link(name, target)`**：生成 `<a href="catvod://<url-encoded-json>">name</a>`，用于演员/导演可点击链接。

#### 4.4.4 proxy 的两种协议

| 模式 | 触发 | JS `proxy()` 入参 | 返回 |
| --- | --- | --- | --- |
| 普通（`do=js`） | `params.from != "catvod"` | 扁平对象 `{url, id, type, do, siteKey, ...}` | `[status, mime, body, headers?, isBase64?]` |
| js2Proxy | `params.from == "catvod"` | `(pathArray, headerObject)`（URL 按 `/` 拆数组） | JSON `{"code","headers","content","buffer"}` |

#### 4.4.5 `init(ext)` 的三种入参

| 场景 | `init` 收到 |
| --- | --- |
| 原生 JS + ext 是 JSON 字符串 | JS 对象 |
| 原生 JS + ext 是普通字符串/URL | 原字符串 |
| cat 模式（含 `__jsEvalReturn`） | `{stype:3, skey:<siteKey>, ext:<原ext>}` |

### 4.5 type=3 + drpy2：`rule` 式 JS 源协议

两个参考仓库大量使用这种形态：`api` 指向打包的 drpy2 引擎，`ext` 指向规则文件。

```jsonc
{"key": "nangua", "name": "南瓜影视", "type": 3, "playerType": "2",
 "api": "./js/通用api数据.js",     // drpy2 3.9.48beta16 引擎（43,489 字节）
 "ext": "./js/南瓜配置.js"}        // 规则数据（var rule = {...}）
```

#### 4.5.1 模板 + 数据分离机制

引擎（`通用api数据.js` / `lib/drpy2.min.js`）在 `init(ext)` 里执行：

```js
if (typeof ext == "object") { rule = ext }
else if (typeof ext == "string") {
    if (ext.startsWith("http")) { let js = request(ext, {method:"GET"}); if (js) { eval(js.replace("var rule","rule")) } }
    else { eval(ext.replace("var rule","rule")) }        // ★ 关键：var rule → rule，写入外层作用域
}
```

随后继承模板字典：

```js
if (rule.模板 && muban.hasOwnProperty(rule.模板)) rule = Object.assign(muban[rule.模板], rule);
// 规则里的同名键覆盖模板；模板补充未写的键
```

**模板字典**（`lib/模板.js` 的 `getMubans()`）内置：`mxpro`、`mxone5`、`首图`、`首图2`、`搜索1`、`搜索2`、`默认`、`vfed`、`海螺3`、`海螺2`、`短视`、`短视2`、`采集1`。
每个模板约 22 个字段：`title host url searchUrl searchable quickSearch filterable headers class_parse play_parse lazy limit 推荐 double 一级 二级 搜索 timeout cate_exclude class_name class_url filter_url filter filter_def detailUrl`。

#### 4.5.2 `rule` 对象字段全表

**基础信息**

| 字段 | 含义 |
| --- | --- |
| `title` | 站名；同时作为存储前缀 `RKEY = "drpy_" + (rule.title \|\| rule.host)` |
| `host` | 站点根（自动 `rstrip("/")`，与各 URL 模板 `urljoin`） |
| `homeUrl` | 首页/推荐页路径 |
| `url` | 一级（分类）URL 模板，含 `fyclass`/`fypage`/`fyfilter` |
| `detailUrl` | 详情 URL 模板，含 `fyid` |
| `searchUrl` | 搜索 URL 模板，含 `**`（关键字）与 `fypage` |
| `headers` | 全局请求头；`User-Agent` 可写 `MOBILE_UA`/`PC_UA`/`UC_UA`/`IOS_UA`/`UA` 宏；`Cookie` 可写 URL 自动拉取 |
| `timeout` | 请求超时 ms，默认 5000 |
| `encoding` / `编码` | 页面编码，默认 `utf-8`；非 utf-8 时自动加 `Content-Type: text/html; charset=` |
| `search_encoding` / `搜索编码` | 搜索词编码 |
| `图片来源` | 图片 URL 后缀（防盗链参数），如 `@Referer=...@User-Agent=...` |
| `模板` | 继承模板名 |
| `hostJs` | 动态求 host 的代码，init 时 `eval` |
| `预处理` | init 末尾执行的代码（可 `js:` 前缀） |
| `cate_exclude` | 分类名排除（与内置 `首页\|留言\|APP\|下载\|资讯\|新闻\|动态` 合并） |
| `tab_exclude` | 线路名排除（与内置 `猜你\|喜欢\|下载\|剧情\|热播` 合并） |
| `double` | 推荐是否双层定位（列表容器 + 条目两级选择器） |
| `limit` | 每页条数（drpy 侧仅透传） |
| `searchable` | 0 关 / 1 开 / 2 开且可翻页 |
| `quickSearch` / `filterable` | 0/1 |
| `filter_url` | 筛选参数模板，`{{fl.xxx}}` 占位；`fyfilter` 被替换为该串 |
| `filter` | `{"type_id":[{key,name,value:[{n,v}]}]}` |
| `filter_def` | `{"type_id":{key:默认值}}` |
| `class_name` / `class_url` | `&` 分隔的分类名 / 分类值 |
| `class_parse` | 从首页 HTML 抓分类：`列表选择器;名称;链接[;链接正则]` |
| `pagecount` | `{"type_id":固定页数}` |
| `params` | ext 为 URL 时 `?type=url&params=xxx` 的参数 |

**内容选择器**

| 字段 | 形态 | 含义 |
| --- | --- | --- |
| `推荐` | 规则串 / `"*"` / `"js:..."` | 首页推荐；`"*"` 复用 `一级` |
| `一级` | 规则串 / `"js:..."` | 分类/搜索列表项，5 段（`double` 时 6 段） |
| `二级` | 对象 / `"*"` / `"js:..."` | 详情页规则 |
| `搜索` | 规则串 / `"js:..."` | 搜索结果；`"*"` 复用 `一级` |
| `二级访问前` | JS | 请求详情页前执行 |
| `重定向` | JS | 详情页重定向 |
| `lazy` | JS | 免嗅探脚本 |
| `play_parse` | Boolean | 是否启用免嗅探 |
| `play_json` | Array/Object | 对播放结果套 JSON 模板 |
| `sniffer` | 0/1 | 辅助嗅探代理 |
| `isVideo` | 正则 / `js:` | 辅助嗅探判断 |
| `proxy_rule` | JS | 本地代理规则，改写 `input` 为 `[status,mime,body]` |
| `tab_remove` / `tab_order` / `tab_rename` | Array/Object | 线路移除/排序/重命名 |

**`二级` 对象子字段**：`title`（`;` 分隔多路，第一路作 `vod_name`、第二路作 `type_name`）、
`img`、`desc`（`;` 分隔五段：备注;年份;地区;演员;导演）、`content`、
`tabs`（线路标签，支持 `#id`/`#idv` 占位）、`tab_text`、`lists`、`list_text`、`list_url`、`重定向`。

#### 4.5.3 规则串语法（`;` / `&&` / `||`）

```
一级: '列表选择器;名称;图片;备注;链接'
      每段内部可用 && 串联取值步骤，用 || 提供备选
      选择器支持 :eq(n) :lt(n) :gt(n) :first :last #id body
      取值关键字：Text（文本）、Html（HTML）、属性名（href/src/data-original/...）
      末段可以是正则 /pattern/ 做提取
      首段可加解析器前缀：jq:（默认 Jsoup）/ jsp:（带 style url() 提取）/ json:（JSONPath）
```

实例（`模板.js` 的 `mxpro`）：

```js
class_parse: '.navbar-items li:gt(2):lt(8);a&&Text;a&&href;/(\\d+).html',
推荐: '.tab-list.active;a.module-poster-item.module-item;.module-poster-item-title&&Text;.lazyload&&data-original;.module-item-note&&Text;a&&href',
一级: 'body a.module-poster-item.module-item;a&&title;.lazyload&&data-original;.module-item-note&&Text;a&&href',
二级: {
    "title": "h1&&Text;.module-info-tag&&Text",
    "img": ".lazyload&&data-original",
    "desc": ".module-info-item:eq(1)&&Text;.module-info-item:eq(2)&&Text;.module-info-item:eq(3)&&Text",
    "content": ".module-info-introduction&&Text",
    "tabs": ".module-tab-item",
    "lists": ".module-play-list:eq(#id) a"
}
```

实现要点（`通用api数据.js` 的 `parseTags`）：

- `jsp`/`json` 两套解析器；`json` 模式要求路径以 `$.` 开头，用 `||` 提供备选，第一个非空值胜出。
- `pdfh2` 对 `style` 属性会提取 `url(...)` 内容。
- 结果为相对 URL 且属性匹配 `URLJOIN_ATTR`（`url|src|href|-original|-src|-play|-url|style$`）时，
  自动 `urljoin(MY_URL, ret)`；若已含 `http` 则从 `http` 处截断。
- `SPECIAL_URL = /^(ftp|magnet|thunder|ws):/` 的值不做 URL 拼接。
- 第 5 段（链接）支持 `+` 拼接多属性。
- `rule.detailUrl` 非空时第 5 段用 `_pdfh`（不补全 URL），否则用 `_pd`（补全）。

#### 4.5.4 `js:` 脚本约定变量

| 变量 | 含义 |
| --- | --- |
| `input` | 当前 URL |
| `MY_URL` / `MY_CATE` / `MY_PAGE` / `MY_FL` | 当前请求 URL / 分类 / 页码 / 筛选对象 |
| `TYPE` | `"home"`/`"cate"`/`"search"`/`"detail"` |
| `HOST` | `rule.host` |
| `fetch_params` / `oheaders` | 预置请求参数/头 |
| `VODS` / `TABS` / `LISTS` | 输出数组 |
| `setResult(d)` / `setResult2(res)` | 把 `[{url,title,img,desc,content,pic_url}]` 转成标准 VODS |
| `print` / `log` / `fetch` / `post` | 日志与网络 |
| `joinUrl` / `urljoin` / `urljoin2` | URL 合并 |
| `md5` / `base64Encode` / `base64Decode` / `encodeStr` / `gbkTool` | 加解密与编码 |

#### 4.5.5 `lib/` 下 JS 库

| 文件 | 用途 | 引入方式 |
| --- | --- | --- |
| `cheerio.min.js` | jQuery 风格 HTML 解析 + **JSONPath**（`jp`）+ `jinja2` 渲染 | `import cheerio from "assets://js/lib/cheerio.min.js"` |
| `crypto-js.js` | MD5/SHA/AES/DES/Base64（全局 `CryptoJS`） | 副作用 import |
| `jinja.js` | Jinja2 模板渲染（全局 `jinja.render`） | 副作用 import |
| `json5.js` | 宽松 JSON 解析（全局 `JSON5`） | 副作用 import |
| `pako.min.js` | zlib/gzip（全局 `pako`） | 副作用 import |
| `gbk.js` | GBK/GB2312 ↔ Unicode（`export function gbkTool()`） | 具名 import |
| `node-rsa.js` | RSA 加解密/签名（全局 `NODERSA`） | 副作用 import |

### 4.6 type=4：HTTP API 源

新一代协议：`api` 是一个 HTTP 端点，客户端以固定 JSON 与之交互，`/play` 的请求/响应
与 `playerContent` 的返回**完全同构**（`docs/development.md:146`）。

### 4.7 内置 `csp_*` 蜘蛛的 ext 契约

| 类 | ext 形态 | 播放实现 |
| --- | --- | --- |
| `csp_AList` | `[Drive]` 或 `{vodPic, drives:[Drive]}` | `fs/get` 直链 + 115/百度 UA |
| `csp_Local` | 无 | `file://` 直连；proxy 生成视频缩略图 |
| `csp_Market` | `[{name, list:[{name,url,icon?,copy?,version?}]}]`（可为 URL） | `action(url)` 下载安装 |
| `csp_Push` | 无 | `flag` = `直連`/`解析`/`嗅探` |
| `csp_MQiTV` | `[{name, url}]`（酒店 IPTV） | 拼 m3u8 代理 |
| `csp_Proxy` | — | 仅 `do=ck` 回 "ok" |
| `csp_Samba` | `[{name, server}]`，`server` = `smb://[user:pass@]host[:port]/share/sub` | `url = smb://...` |
| `csp_WebDAV` | `[{name, server, user, pass, path?}]` | 本地代理加 Basic Auth 流式转发 |
| `csp_Demo` | 任意 JSON | 官方全功能示例 |

#### AList 协议细节（`csp_AList`）

`ext` 的 `drives[]` 字段：

| 字段 | 说明 |
| --- | --- |
| `name` | 显示名（也是 `type_id`） |
| `server` | AList 站点根（可含 path） |
| `version` | `2` 旧版 / `3` 新版；`0` 自动探测 |
| `path` | 起始目录 |
| `token` | 已登录 token |
| `search` | 是否参与搜索，缺省 true |
| `hidden` | 首页隐藏 |
| `login` | `{username, password}` |
| `params` | `[{path, pass}]` 目录密码 |

HTTP 调用序列（全部 POST + JSON body，`User-Agent: Chrome`，有 token 时 `Authorization: <token>`）：

| 用途 | v3 | v2 |
| --- | --- | --- |
| 版本探测 | `{host}/api/public/settings`（响应含 `"v2."` → v2） | 同 |
| 登录 | `{host}/api/auth/login` → `data.token` | 同 |
| 列目录 | `{host}/api/fs/list` | `{host}/api/public/path` |
| 取详情/直链 | `{host}/api/fs/get` → `data.url`/`data.raw_url` | `{host}/api/public/path` |
| 搜索 | `{host}/api/fs/search`（`{keywords,page,parent:"/",per_page:100,scope:0,password}`） | `{host}/api/public/search`（`{keyword,path:"/"}`） |

- 响应 `message` 含 `Guest user is disabled` 时自动登录并**重试一次**。
- `code != 200` 抛 `IllegalStateException("AList API " + code + ": " + message)`。
- 直链 `//` 开头会补 `http:` 协议；播放头按域名特判（`115` → Chrome UA，`baidupcs.com` → `pan.baidu.com`）。
- 参考仓库 `json/alist.json` 用 `{"vodPic": "...", "drives": [...]}` 外壳（魔改版 AList 支持 `vodPic` 文件夹图标）。

### 4.8 详情简介抓取与 HTML 清理（黄金向量）

`TVBoxOS-M3/app/src/main/java/com/github/tvbox/osc/util/HomeMetadata.java` 给出了一份
**只读简介、绝不碰播放地址**的元数据抓取规范，附 `tests/HomeMetadataTest.java` 的
12 条黄金向量。第三方实现做「详情页简介/豆瓣简介」时应整段照抄——它的每一条规则都是
踩过坑之后的结果。

#### 4.8.1 身份匹配：绝不用「列表第一条」冒充

```java
private static boolean matches(String id, String name, String expectedId, String expectedName) {
    if (!id.isEmpty()) return id.equals(expectedId);          // 有 ID 就只认 ID
    return !clean(name).isEmpty() && clean(name).equals(clean(expectedName));  // 无 ID 才退回标题精确相等
}
```

| 场景 | 期望行为 |
| --- | --- |
| 列表里有 `vod_id=42` 与 `vod_id="wrong"`，请求 `id=42` | 取 `42` 的简介 |
| 请求 `id="absent"`，但有同名条目 | 返回 `null`——**不同 ID 绝不覆盖当前影片的简介** |
| 条目无 `vod_id`，标题与目标完全相同 | 允许（标题兜底） |
| 条目无 `vod_id`，标题是另一部 | 返回 `null`——**不借别人的简介** |

#### 4.8.2 标题比较与年份宽松匹配

```java
sameTitle(a, b)  =  clean(a).replaceAll("\\s+","") 与 clean(b).replaceAll("\\s+","") 非空且 equalsIgnoreCase
sameYear(a, exp) =  exp <= 0 || a.isEmpty() → true；数字解析失败 → true；否则整数相等
```

- 标题比较**忽略大小写、忽略所有空白**。
- 年份是**宽松条件**：目标年份为 0、源缺年份、年份非数字，都视为匹配。
- `findExactSourceId(body, xml, name, year)`：遍历后若出现**两个不同 ID 都匹配**，
  返回 `null`（同名重拍版**不猜**）。这是「宁可没有简介，不可给错简介」的明确取舍。

#### 4.8.3 HTML → 纯文本（`clean`）

```java
public static String clean(String html) {
    if (html == null) return "";
    Document document = Jsoup.parse(html);
    document.select("script,style").remove();          // 先删脚本与样式
    return document.text().replace(' ', ' ').trim();  // 取纯文本，NBSP 转空格，trim
}
```

| 输入 | 输出 |
| --- | --- |
| `"<p>第一段 &amp; 第二段</p><script>bad()</script>"` | `第一段 & 第二段` |
| `"<b>目标电影</b>"`（作标题用） | `目标电影` |
| `null` | `""` |

- `document.text()` 会**解码 HTML entity** 并丢弃全部标签。
- **必须先删 `script,style` 再取 text**，否则脚本内容会混进简介。
- ` `（NBSP）显式替换为普通空格——不替换会被当成非空白，`trim()` 不掉。
- `nonEmpty()` 守卫：清理后为空则整体返回 `null`，不产生「空简介」对象。

#### 4.8.4 XML 分支（MacCMS XML 的同一套规则）

- 用 `Jsoup.parse(body, "", Parser.xmlParser())`，选择器 `list > video`。
- 字段：`id` / `name` / `year` / `des`，其中 `des` 支持 **CDATA**：
  `<des><![CDATA[<p>中文简介</p>]]></des>` → `中文简介`。
- `<des/>` 空元素 → `null`。
- 非 JSON/XML 的畸形载荷 → `catch(Exception)` 吞掉，返回 `null`（**安静失败，不抛给 UI**）。

#### 4.8.5 豆瓣简介（`fromDouban`）的三道闸门

```java
public static HomeMetadata fromDouban(String html, String subjectId) {
    if (html == null || subjectId == null || !subjectId.matches("[0-9]+")) return null;   // 闸 1
    Document document = Jsoup.parse(html);
    Element canonical = document.selectFirst("link[rel=canonical]");
    if (canonical != null &&
        !canonical.attr("href").matches("https?://movie\\.douban\\.com/subject/" + subjectId + "/?"))
        return null;                                                                      // 闸 2
    Element summary = document.selectFirst("#link-report .all.hidden");
    if (summary == null) summary = document.selectFirst("[property=v:summary]");          // 闸 3
    return summary == null ? null : nonEmpty(summary.text());
}
```

| 黄金向量 | 结果 |
| --- | --- |
| 页面含 `#link-report .all.hidden`（完整剧情）与 `[property=v:summary]`（短版） | 取**完整剧情**（先匹配 `.all.hidden`） |
| canonical 指向别的 subject | `null`（重定向拒绝） |
| 页面是「请登录」 | `null`（**不造假简介**） |
| `subjectId = "../123"` | `null`（subject 必须是纯数字，防路径注入） |
| canonical 缺失 | 不拦，继续按选择器取 |

> **可移植结论**：任何「从网页补简介」的功能都应实现这三道闸门——
> ① 入参 ID 严格白名单字符；② 用 canonical/最终 URL 反查身份；③ 取不到就返回空，
> 不用同名单在第一顺位的结果顶替。

### 4.9 WebDAV / AList 远程目录浏览（DV 版，可直接实现）

`TVBOX-DolbyVision-HDR10-Edition` 新增 `com.github.tvbox.osc.webdav` 包，
在设置里保存「服务器地址 + 账号 + 密码」后，首页「本地」入口可浏览远程目录并直接播放，
同目录同名字幕自动加载，也可从当前目录手动选择字幕。

**默认端口 `5244`**（AList 的 WebDAV 默认端口），地址规范化后存入
`Hawk` 的 `webdav_url` / `webdav_username` / `webdav_password`。

#### 4.9.1 列目录（`PROPFIND`）

```http
PROPFIND /dav/路径/ HTTP/1.1
Host: 192.168.1.10:5244
Depth: 1
Authorization: Basic <base64(user:pass)>
Content-Type: application/xml; charset=utf-8

<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getcontenttype/>
  </d:prop>
</d:propfind>
```

- **必须带 `Depth: 1`**——否则部分服务器返回整棵树。
- 取的四个属性：显示名、资源类型（据此判断目录）、大小、Content-Type。
- 鉴权走 `okhttp3.Credentials.basic(user, pass)`；用户与密码都为空则**不发** `Authorization` 头。
- 解析响应 XML 得 `WebDavEntry { name, url, isDirectory, size }`，按名字排序
  （目录在前由 `isDirectory` 决定）。

#### 4.9.2 资源边界（防爆）

| 项 | 上限 |
| --- | --- |
| 单次列表响应体 | 4 MiB |
| 单次列表条目数 | 2000 |
| 单个字幕文件 | 8 MiB |
| 连接 / 读取超时 | 10s / 20s |

字幕下载后走 §5.12.1 的 5–6 格式解析器（DV 版多一个 `FormatVTT`）。

#### 4.9.3 与 §4.7 AList 协议的关系

| | §4.7 `csp_AList` | 本节 WebDAV |
| --- | --- | --- |
| 入口 | 作为站点出现在 `sites[]` | 设置页配置 + 首页「本地」入口 |
| 协议 | AList JSON API（`/api/fs/list`）+ `&sign=` 续签 | 标准 WebDAV（`PROPFIND`） |
| 播放 | 产出 `vod_play_url` 直链 | 直接播放远程文件 URL |
| 默认端口 | AList  HTTP 端口 | **5244** |

两者可共存：AList 站点走配置驱动，WebDAV 走本地设置驱动。

---

## 5. 播放、解析与嗅探协议

### 5.1 `playerContent` 返回字段全表

| key | 类型 | 说明 |
| --- | --- | --- |
| `parse` | int | `0` 直连播放；`1` 交给客户端解析/嗅探 |
| `jx` | int | `1` 强制走 `parses` 里的 VIP 解析器 |
| `url` | string \| object | 播放地址；对象形态为多画质 `{"values":[{"n","v"}],"position":n}` |
| `header` | object \| string | 播放请求头（字符串化的 JSON 也接受） |
| `subs` | array | `[{url,name,lang,format,flag}]`，`format` 为 MIME；`flag` 1 默认选中、2 强制 |
| `danmaku` | array \| string | 弹幕文件；`danmakuUrl(id)` 生成的 URL 会回调 `danmaku()` |
| `drm` | object | `{key,type,forceKey,header}`，`type` ∈ `widevine`/`playready`/`clearkey` |
| `skips` | array | `[{type,start,end}]`，毫秒；`type` ∈ `opening`/`middle`/`ending`，`ending` 可省略 `end` |
| `timeshift` | object | 直播回看 `{url,start,window}`；`start` 为 Unix 毫秒，`window` 为可回看毫秒数，`url` 保留 `{time}` |
| `position` | long | 起播位置（毫秒） |
| `format` | string | 媒体格式提示 |
| `playUrl` | string | 前缀 URL，最终播放地址 = `playUrl + url` |
| `artwork` / `desc` | string | 播放页海报 / 副标题 |
| `click` | string | 自定义 WebView 脚本 |
| `web` | object | `{url,mode,cookie}` 打开网页 |
| `msg` | string | 无源时的提示 |
| `list` | array | **播放详情更新**：以 `list[0]` 回传新 VOD 详情 |
| `key`/`code`/`flag`/`jxFrom` | — | 辅助字段 |

**`url` 的三种形态**：字符串（单一直链）、数组（每两个元素一组 `(name, url)`）、
对象（`{"values":[{n,v}],"position":n}`，`position` 为 **0 基索引**，与顶层毫秒级 `position` 语义不同）。

### 5.2 `parse` / `jx` 的判定逻辑（源码级）

```java
public boolean isUseParse() {
    if (!VodConfig.hasParse()) return false;
    return (getPlayUrl().isEmpty() && VodConfig.get().getFlags().contains(getFlag())) || getJx() == 1;
}
public boolean needParse() { return getParse() == 1 || getJx() == 1; }
```

| 返回组合 | 客户端行为 |
| --- | --- |
| `parse=0` + `url` 非空 | 直接播放（`playUrl` 非空则拼前缀） |
| `parse=1` | 进入解析流程（WebView 嗅探，或按 `flag` 匹配 `parses`） |
| `jx=1` | 强制使用配置的 VIP 解析器 |
| `url` 为空 + `parse=1` | 交给解析器/嗅探继续（对应 `sniff_url` 场景） |
| `parse=0` + `url` 为空 | 报错，客户端**不会**自动嗅探 |

**要客户端去嗅探网页时：返回 `parse=1` + `url=网页地址`。**

#### 5.2.1 DV 版的等价公式与两个易错点

DV 版（`PlayActivity.java:2846-2909`）把同一逻辑写成：

```java
userJxList = (playUrl.isEmpty() && flags.contains(flag)) || jx == 1;
```

即 **「`playUrl` 为空**且当前 `flag` 在顶层 `flags` 白名单里」**或** `jx==1`。
与 §5.2 的 `isUseParse()` 等价，但有两个实现细节会坑人：

1. **`parse` 只认字符串 `"1"`**——DV 版用 `optString("parse")` 后与 `"1"` 比较。
   爬虫若返回数字 `1`（JSON number），会被当成非 `"1"` 而**不进入解析**。
   **Python/JS 源必须返回字符串 `"1"`**。
2. `site.type == 2` 在 DV 版**没有任何分支**（`switch` 只覆盖 0/1/3/4），
   落到 default 静默返回空——与经典版「直接返回 null」一致。

#### 5.2.2 点播主流程与 `type=3` 的 6677 快路径（DV 版源码级）

DV 版的点播起播链（第三方实现可按此复刻顺序）：

```
DetailActivity.playCurrentSelection
  └─ Bundle 只放 sourceKey，VodInfo 走 App.setVodInfo() 全局单例
       └─ PlayActivity.initData → PlayFragment.setData → play(false)
            └─ SourceViewModel.getPlay        ← 按 site.type 分 3 / 0 / 1 / 4
                 └─ normalizePlayResult
                      └─ 读 parse / jx → userJxList（§5.2.1）
                           └─ initParse（json: / parse: 前缀）→ doParse
                                ├─ 0 嗅探
                                ├─ 1 JSON
                                ├─ 2 jsonExt（JAR 内 Json{key}）
                                ├─ 3 聚合（JAR 内 Mix{key}）
                                └─ 4 超级（SuperParse，§4.3.3.1）
                                     └─ playUrl（M3U8 去广告开关）
                                          └─ goPlayUrl
                                               ├─ 解析 @Headers= / @User-Agent=（§8.10）
                                               ├─ 流探测（§5.8.2.6）
                                               ├─ DV 路由（§5.8.2.1）
                                               ├─ HDR 窗口模式
                                               └─ 起播
```

**`type=3` 的 6677 直连快路径**：`SourceViewModel.getPlay` 对 `type=3` 有特殊分支——
若播放地址已是 `127.0.0.1:6677` + `/proxy/play/` 形态（§5.8.2.8），**跳过解析直接起播**，
超时 **10s**。这是网盘类爬虫（夸克/百度）的关键优化：省掉一次无谓的嗅探。

**`VodInfo` 走全局单例**（`App.setVodInfo`）而非 Intent 传递——
`DetailActivity` 只往 Bundle 放 `sourceKey`。第三方实现若用 Intent 传大对象会
`TransactionTooLargeException`，这是 TVBox 规避该问题的既有做法。

**DV 版新增 bean**（`bean/` 包，做数据模型时对照）：
`AbsSortJson`、`IpScanningVo`、`LiveDayListGroup`、`LiveEpgDate`、`LivePlayerManager`、
`Subtitle`、`SubtitleData`、`player/TrackInfo`、`player/TrackInfoBean`。
`VodInfo` 新增 `playerCfg` / `reverseSort` 两个字段。
**不存在 `IJKCode`**（无 IJK 的直接后果，见 §5.8.1.0）。

### 5.3 `flag` 与 `flags`/`parses` 的匹配

- `vipFlags` = 配置顶层 `"flags": ["qq","qiyi",...]`，是「这些线路名需要 VIP 解析」的白名单。
- 只有 `flag ∈ flags` 且 `playUrl` 为空时才会选 VIP 解析器。
- 爬虫若要**强制**走解析，最稳的是回 `jx=1`；要交给 WebView 嗅探就回 `parse=1`。
- 回传未写 `flag` 时沿用请求的 `flag`。

### 5.4 多画质

`{"values":[{"n":"高清","v":"https://.../hd.m3u8"},{"n":"标清","v":"https://.../sd.m3u8"}],"position":0}`

### 5.5 播放详情更新（`list[0]`）

`playerContent` 可额外回传 `"list":[vod]`，客户端用其更新当前 VOD（按 `vod_play_from` 合并、
同名同值去重、保留当前选集位置）。预载结果在切集时套用，取消或过期的结果丢弃。

### 5.6 `parses[]` 的 type 语义与解析流程

| type | 含义 | 客户端动作 |
| --- | --- | --- |
| `0` | 普通嗅探 | 起 WebView 打开目标网页嗅探直链 |
| `1` | JSON 解析接口 | `GET {url}{目标地址}`，解析返回 JSON 取 `url` |
| `2` | Json 扩展 | 调用 JAR 内 `com.github.catvod.parser.Json<name>.parse(jxs, url)` |
| `3` | Mix 扩展 | 调用 JAR 内 `com.github.catvod.parser.Mix<name>.parse(jxs, name, flag, url)` |
| `4` | 自动（客户端插入） | 客户端内置 `superParse` 逻辑自动选择 |

- `ext` 必须是 JSON **对象**，常用 `{"flag":["qiyi","youku"]}` 限定生效平台。
- `url` 以 `proxy://` 开头时，会被替换成本地代理地址（`http://<ip>:9978/proxy?`）。
- `name` 与 `flag` 对齐：解析器按 `parses[].name` 与当前播放 `flag` 匹配。
- 配置里 `parses` 非空时，客户端会在索引 0 插入 `{"name":"自动","type":4}`。

参考仓库实例（`2.json`）：

```jsonc
"parses": [
  {"name":"Json聚合","type":1,"url":"http://api.parline.top/json/?url=","ext":{"flag":["qiyi","imgo","QQ"]}},
  {"name":"Json并发","type":2,"url":"Parallel"},
  {"name":"Json序列","type":2,"url":"Sequence"},
  {"name":"Web聚合","type":3,"url":"Demo","ext":{"flag":["mgtv","YOUKU","奇艺"]}},
  {"name":"普通嗅探","type":0,"url":"https://www.kxyjs.com/?url="}
]
```

### 5.7 嗅探（Sniffer）

- 客户端内置 `Sniffer.isVideoFormat(url)`，判定依据是 **URL 正则（后缀白名单）**——
  **不检查 Content-Type，也没有 PlayerType 白名单**；并显式排除 `=http` 与 `.html`
  （`Sniffer.java:26`）。
- 判定顺序：`rules` 的 `regex`/`exclude` → 爬虫的 `manualVideoCheck()==true` 时**完全交给**
  爬虫的 `isVideoFormat(url)`（可否决内置规则，例如拦掉含 `/ad/` 的 `.mp4`）→ 通用后缀正则。
- `rules` 里的 `{"host":"api.52wyb.com","rule":["m3u8?pt=m3u8"]}` 是**嗅探正则**；
  `{"host":"www.maolvys.com","rule":["document.getElementsByClassName('swal-button')[0].click()"]}` 是**注入 WebView 的 JS**。
- **只取第一个候选地址**：WebView 请求拦截里一旦命中就停，不再等后续请求；
  总超时 **20s**（`PlayFragment` 的 `checkVideoFormat` / 拦截回调，`2790-2799`、`2947-2979`）。
  拦截链路另走 `isFilter` 与 `AdBlocker` 二次过滤。
- 多画质的判定：`playerContent` 返回的 `url` 是**偶数长度的 JSON 数组**时按多画质处理。
- `site.click` 的格式是 `页面URL片段;JS代码`——仅当页面 URL **包含**该片段时才执行，
  且后半段是**任意 JavaScript**（`evaluateJavascript` 原样执行），
  **不会**自动补 `.click()`（`VodController.evaluateScript`，M3 `player/controller/VodController.java:2035-2066`）。
  `clickSelector` 为空时回退到 `rules[].rule` 里该 host 的脚本（`VideoParseRuler.getHostScript(url)`）。
  API ≥ KITKAT 用 `evaluateJavascript(js, null)`，更低用 `loadUrl("javascript:" + js)`。
  > ⚠️ 早期版本会自动追加 `.click()`，M3 已把该行**注释掉**——
  > 第三方实现应按「原样执行」处理，否则 `document.querySelector('#x').click()` 会变成
  > `….click().click()` 而报错。

#### 5.7.1 ⚠️ URL 后缀 `;p ;j ;u ;r ;m ;s ;f ;c ;e` 协议**不存在**

社区流传的「URL 末尾分号参数」逐字符协议，在 TVBoxOSC 三份源码
（`TVboxOSC-main`、`TVBoxOSC-LiveOnly-master`、`dr_py-main`）里**全部不存在**。
与「URL 后缀分号」有关的全部命中只有：

| 出现处 | 形式 | 含义 |
| --- | --- | --- |
| 爬虫/配置 | `路径;md5;摘要` | 文件校验（§3.2） |
| 订阅地址 | `url;pk;key` | AES 密钥（§3.1.1） |
| `site.click` | `页面片段;CSS选择器` | 条件点击 |
| 种子判断 | `url.split(";")[0]` | 取分号前判断 `.torrent` |
| drpy JS 规则（源侧） | `url;post` / `url;postjson` | 指定请求方法 |

原版把「附加信息」全部放在**结构化字段**里：`header`、`playUrl` 前缀、`playUrl="json:"/"parse:"`、
`subs`、`drm`、`skips`、`format`、`click`、`proxy://`。
若要兼容其它分支的 `;` 后缀，建议按「最后一个 `;` 之后若形如单字母则剥离并解释」实现，
但**必须默认关闭**且只在无法解析时回退，否则会误伤含 `;` 的 CDN 签名 URL。

### 5.8 播放器内核与 `playerType`

| 值 | 内核 |
| --- | --- |
| `0` | 系统 MediaPlayer |
| `1` | IJK（ffmpeg 软解/硬解） |
| `2` | ExoPlayer |

依据：`HawkConfig.PLAY_TYPE` 注释 `//0 系统 1 ijk 2 exo`。
`site.playerType` 与全局设置可分别是字符串或整数（参考仓库中两种写法并存，实现须都接受）。

> ⚠️ **`play_type` 的取值语义按分支而变，不是全局常量**：
> 经典/多数分支是 `0 系统 / 1 ijk / 2 exo`；`TVBOX-DolbyVision-HDR10-Edition` 改成了
> `0 系统 / 10+ 外部播放器`（`HawkConfig.PLAY_TYPE` 注释 `//0 系统 10+ 外部播放器`），
> 且它的 `resolvePlayerType()` 无条件返回系统播放器（见 §5.8.2.1）。
> 第三方实现应把该值当**本地设置**而非协议常量，并准备「读到的值无法映射时回落系统播放器」。

IJK 解码参数来自配置的 `ijk` 数组（`category|name` → 播放器选项）。

#### 5.8.0 设置键清单（第三方实现做「设置页」时对照）

`HawkConfig`（`com.github.tvbox.osc.util.HawkConfig`，键名即 Hawk 存储的 key）：

| 键 | 用途 |
| --- | --- |
| `api_url` / `home_api` | 点播配置地址 / 首页数据源 |
| `live_api_url` | 直播配置地址 |
| `epg_url` | EPG 地址 |
| `api_history` / `live_api_history` / `epg_history` / `search_history` | 各类历史 |
| `show_preview` | 首页预览 |
| `parse_default` | 默认解析器 |
| `parse_webview` | `true` 系统 WebView，`false` XWalk |
| `play_type` / `live_play_type` | 点播 / 直播内核（**语义见上**） |
| `play_render` / `play_scale` / `play_time_step` | 渲染方式 / 画面缩放 / 快进步长 |
| `player_audio_passthrough` | 音频直通 |
| `player_route_migration_version` | 播放路由迁移版本（一次性强制重置用） |
| `doh_url` / `doh_json` | DoH 开关 / DoH 配置 |
| `home_rec` / `home_rec_style` | 首页推荐来源（0 豆瓣热播 / 1 数据源推荐 / 2 历史）与样式 |
| `history_num` | 保留历史条数 |
| `search_view` | `0` 列表 / `1` 缩略图 |
| `fast_search_mode` | 快速搜索 |
| `checked_sources_for_search` | 参与搜索的源 |
| `last_live_channel_name` / `live_group_index` / `live_group_list` | 上次直播频道与分组状态 |
| `live_channel_reverse` / `live_cross_group` | 频道列表反转 / 跨分组切换 |
| `live_connect_timeout` / `live_show_net_speed` / `live_show_time` | 直播连接超时 / 显示网速 / 显示时间 |
| `live_web_header` | 直播 Web 请求头 |
| `subtitle_text_size` / `subtitle_time_delay` | 字幕字号 / 时间偏移 |
| `screen_display` | 屏幕显示 |
| `remote_tvbox_host` | 遥控/推送主机 |
| `player_is_live` | 播放器是否处于直播态 |
| `now_date` | 当前日期（EPG 用） |
| `debug_open` / `internal_log_enabled` / `internal_log_policy_version` | 调试开关与内建日志策略 |
| `DEFAULT_LOAD_LIVE` | 是否默认加载直播 |
| `webdav_url` / `webdav_username` / `webdav_password` | **WebDAV/AList 远程目录**（DV 版新增，可在首页「本地」入口浏览并直接播放） |
| `DEFAULT_API_URL` | 默认配置地址（如 `http://www.饭太硬.net/tv`） |

#### 5.8.1 播放内核选型的实测数据（TVBoxOS-M3，AGPL-3.0）

`TVBoxOS-M3` 把上游的 ExoPlayer2 2.19.1 整体迁到 **Media3 1.8.0**，是唯一一份
公开的「内核换代」实测报告，第三方实现选型时可直接引用：

| 项 | 上游 | M3 |
| --- | --- | --- |
| 播放器 | `com.google.android.exoplayer2:2.19.1` | `androidx.media3:1.8.0` |
| FFmpeg | jellyfin exoplayer2 扩展 | `org.jellyfin.media3:media3-ffmpeg-decoder:1.8.0+1` |
| AGP / Gradle | 7.2.2 / 7.5 | 8.1.4 / 8.9 |
| compileSdk / minSdk | 33 / 19 | 35 / 21 |
| 直播 PSS（实测） | IJK 约 350MB | Media3 约 190–215MB |

**关键工程结论**：

1. **软解默认关闭、硬解优先**：`EXTENSION_RENDERER_MODE_ON`（而非 `PREFER`）。
   用 `PREFER` 会让普通 H.264 也走 FFmpeg 软解，电视盒子 CPU 吃不消。
2. **上游的 `libffmpegJNI.so` 从未被初始化**——打包了 `.so` 不等于软解可用，
   必须显式注册 `FfmpegAudioRenderer` + `ExperimentalFfmpegVideoRenderer`。
3. **`ExperimentalFfmpegVideoRenderer` 上游标注 `TODO: Implement`**：
   实际以硬解为主，FFmpeg 主要提供**音频**软解能力。不要把它当通用视频软解。
4. **升级后首次启动强制重置为 `EXO(Media3) + SurfaceView`**（只一次），
   避免用户旧配置停留在 IJK 使改进失效。第三方实现做内核换代时应照此处理。
5. **SurfaceView 优于 TextureView**：可走硬件直通、画质更好。
6. **释放要设超时**：`setReleaseTimeoutMs(100)` / `setDetachSurfaceTimeoutMs(500)`，
   否则停滞的电视硬解会拖住应用线程（直播切台 ANR 的直接成因之一）。
7. **RTMP/RTSP**：协议入口虽在 Media3 有对应模块，但 M3 明确标注「未充分实测」——
   第三方实现要把这两类当高风险项单独验证。

M3 的 `player` 模块是 **DKVideoPlayer（`xyz.doikki.videoplayer`）+ ijkplayer** 的
标准封装，含 `FfmpegRenderersFactory`、`FfmpegSupport`、`HlsErrorHandlingPolicy`，
可作为播放器层的最小可抄骨架。

#### 5.8.1.0 DV 版没有 IJK（与经典/M3 的根本差异）

`TVBOX-DolbyVision-HDR10-Edition` **全仓不含 `IjkMediaPlayer`，也没有 `IJKCode` bean**。
它的播放器是一条单一管线：

```
ExoPlayer 2.19.1
  ├─ 视频：设备 MediaCodec 硬解（SafeSurfaceMediaCodecVideoRenderer）
  ├─ 音频：平台 MediaCodec 优先，FFmpeg 兜底
  └─ 输出：强制 PCM16 双声道（SystemCodecPlayer.java:1440-1476）
```

- `PlayerHelper.updateCfg()`（`PlayerHelper.java:72-96`）**把一切内置值强制改写为 `0`（系统）**——
  即使用户或配置要求 IJK/EXO，也会被拉回系统内核。
- `playerType` 在该分支只剩：`0` 系统、`10` MX、`11` Reex、`12` JustPlayer、`13` 附近 TVBox。
  **`1`（IJK）/`2`（EXO）在该分支无效**——经典/M3 的 `0系统/1ijk/2exo` 语义在此不适用。
- 渲染**只有 SurfaceView，无 TextureView**；宽高比起播时强制 `DEFAULT`。
- **软解不存在**：所有 fallback 都是空实现。
- 结论：**不要把「TVBox 有三个播放内核」当通用结论**。第三方实现应把内核集合做成可配置的，
  并按目标分支决定默认值。

#### 5.8.2 Dolby Vision / HDR 能力路由（`louisYKL` DV 版，可直接实现）

`TVBOX-DolbyVision-HDR10-Edition` 把「HDR/DV 判断 + 解码器路由 + RPU 剥离」写成了
三个纯函数类 + 一个流探测器，是整个 TVBox 生态里唯一一份**完整的 HDR 决策链实现**。
核心原则（README 原文）：**HDR/HDR10+/DV 的判断以视频流探测为准，不靠标题猜测**。

##### 5.8.2.1 路由决策（`DolbyVisionPlaybackRouter.resolve`）

```java
boolean dolbyVision = probe.probed && probe.hasDolbyVision;
boolean hdr = probe.hasDolbyVision || probe.hasHdr10 || probe.hasHdr10Plus;
boolean nativeDolbyVision = SystemDecoderRoutePolicy.shouldUseNativeDolbyVision(
        dolbyVision, caps.codecListDolbyVisionDecoder, caps.displayDolbyVision);

outputMode = nativeDolbyVision ? "native-dv"
          : hdr              ? "base-hdr"
          :                    "sdr";
```

| 输入组合 | 输出模式 | 说明 |
| --- | --- | --- |
| 流含 DV + 设备有 DV 解码器 + 显示支持 DV | `native-dv` | 直接硬解原生杜比视界 |
| 流含 DV + 设备缺任一端 | `base-hdr` | 取 HDR10/HLG 基础层，**剥离 RPU/EL** |
| 流含 HDR10 / HDR10+（无 DV） | `base-hdr` | 原生 HDR 路径 |
| 流为 SDR | `sdr` | 普通路径 |

- `resolvePlayerType()` **无条件返回 `PLAYER_TYPE_SYSTEM`**：该分支把**所有**视频都固定在
  系统 `MediaCodec`，好让厂商硬件平面暴露 HDR/DV/运动补偿；音频不支持才在**同一播放器内**
  转双声道 PCM，**不换视频后端**。
- 探测优先级：`VideoStreamProbe.probe(context, url, headers)`（流探测）优先；
  传入 `Result.unknown("preprobe-null")` 时按 SDR 处理（安全降级）。

##### 5.8.2.2 设备能力查询（`HdrDeviceSupport.query`）

**显示端**（`Display.HdrCapabilities.getSupportedHdrTypes()`，需 API ≥ N）：

| 常量 | 含义 |
| --- | --- |
| `HDR_TYPE_HDR10` | HDR10 |
| `HDR_TYPE_HDR10_PLUS` | HDR10+（**API ≥ 34 (UPSIDE_DOWN_CAKE) 才有该常量**，低版本靠数值比对） |
| `HDR_TYPE_HLG` | HLG |
| `HDR_TYPE_DOLBY_VISION` | 杜比视界显示能力 |

同时取 `getDesiredMaxLuminance()` / `getDesiredMaxAverageLuminance()` /
`getDesiredMinLuminance()` 作为亮度元数据。

**解码端**（三级回退，任一级命中即算支持）：

| 级 | 方法 | 判据 |
| --- | --- | --- |
| 1 | `MediaCodecList` | 存在 MIME `video/dolby-vision` 的解码器 |
| 2 | 读 vendor codec XML | 目录 `/odm/etc`、`/vendor/etc`、`/system/etc`；标记串 `type="video/dolby-vision"`、`c2.qti.dv.decoder`、`omx.dolby`、`video/dolby-vision` |
| 3 | 系统属性 | `persist.sys.feature.dolby_vision`、`persist.sys.feature.dolby_vision_app`、`vendor.display.force_dv_support`、`ro.vendor.oplus.dolby_vision_dpu` 为真 |

HEVC Main10（HDR10/HLG 原生硬解前提）：MIME `video/hevc` 且 profile 命中
`HEVCProfileMain10 (2)` / `HEVCProfileMain10HDR10 (0x1000)` / `0x4000 (HDR10Plus)`。
AVC High10：`AVCProfileHigh10`。

> **关键判断**：`shouldUseNativeDolbyVision = dolbyVisionStream && hwDvDecoder && dvOutput`。
> 仅显示端支持 passthrough 而无 DV 解码器时，**必须**映射成 HDR10/HDR10+ 再激发 HDR。

##### 5.8.2.3 硬件解码器识别（`SystemDecoderRoutePolicy.isLikelyHardwareCodec`）

Android 在 API 29 之前不暴露 `MediaCodecInfo.isHardwareAccelerated()`，只能用名字猜：

```java
if (sdkInt >= 29) return hardwareAccelerated && !softwareOnly;   // 新系统直接用官方标志
String n = codecName.trim().toLowerCase(Locale.US);
if (n.isEmpty()) return false;
if (n.startsWith("arc.")) return true;                            // 厂商硬解前缀
if (n.startsWith("omx.google.") || n.startsWith("omx.ffmpeg.")
 || n.startsWith("c2.android.") || n.startsWith("c2.google.")
 || n.startsWith("sw.") || n.contains(".sw.") || n.contains("software")) return false;
return n.startsWith("omx.") || n.startsWith("c2.");               // 其余 omx./c2. 视为硬解
```

音频解码优先级 `platformAudioDecoderPriority`：硬解 `0`，软解 `1`（取小）。
FFmpeg 音频兜底条件：`shouldUseFfmpegAudioFallback = !platformDecoderAvailable && ffmpegAvailable`。
优先走系统解码的音频格式：Dolby Atmos、AC-3、E-AC-3/JOC、DTS、TrueHD。

##### 5.8.2.4 HDR 判定（`SystemCodecHdrPolicy.isHdr`，含「不误判」规则）

```java
isHdr = dolbyVision                              // mime=video/dolby-vision，或 codecs 含 dvhe/dvh1/dovi
     || hdrTransfer                              // colorTransfer == ST2084(PQ) || HLG
     || hdrStaticInfo                            // colorInfo.hdrStaticInfo 非空
     || main10WideGamutWithoutSdrTransfer        // colorSpace==BT2020 && colorTransfer==-1 && HEVC Main10
     || textMarker;                              // 见下方标记表
```

**「不误判」是重点**：Main10 位深与 BT.2020 色域**单独出现时不算 HDR**——
它们描述位深和色域，不描述传输函数，SDR 也可能带。仅当 `BT2020 + 10bit + transfer 未指定(-1)`
这个组合出现时，才按 HDR 处理（部分厂商 extractor 会把 PQ/HLG 抹成 `-1`）。

**DV 判定**（`isDolbyVision`）：`mime == "video/dolby-vision"`，或 `codecs`/元数据文本含
`dvhe` / `dvh1` / `dovi` / `dolby vision` / `dolby-vision` / `dolbyvision`。

**HDR 文本标记表**（`containsHdrMarker`，对 codecs/id/containerMimeType/metadata 全查）：

| 类别 | 标记 |
| --- | --- |
| 名字 | `hdr10+`、`hdr10plus`、`hdr10` |
| 标准 | `smpte2084`、`smpte 2084`、`smpte2094`、`smpte 2094`、`smpte-st-2084`、`arib-std-b67` |
| ColorTransfer 数值 | `color-transfer=6/7`、`color_transfer=6/7`、`colortransfer=6/7`、`transfer=6/7`、`transfer:6/7` |
| ColorTransfer 名字 | `transfer=st2084`、`transfer=smpte2084`、`transfer=smpte-st-2084`、`transfer=pq`、`transfer=hlg`、`transfer:hlg` |
| 范围 | `video-range=pq`、`video-range=hlg`、`video_range=pq`、`video_range=hlg`、`video range=pq`、`video range=hlg` |
| 静态元数据 | `hdr-static-info`、`mastering-display`、`max-cll`、`maxfall` |

> `6` = SMPTE ST 2084 (PQ)，`7` = ARIB STD-B67 (HLG)，均为 ISO/IEC 23008-2 的
> `colour_transfer` 值。部分手机 extractor 只在 `Format.toString()` 里暴露这些字段，
> 因此 `isHdr(Format)` 会把 `format.toString()` 也拼进 metadata 一起匹配。

##### 5.8.2.5 RPU/EL 剥离（`DolbyVisionRpuStripper`，DV → HDR10 的关键一步）

无 DV 解码能力时，把 DV 流降级为 HDR10 基础层：**按 Annex-B 访问单元遍历，丢掉
NAL type 62 与 63**（DV 的 RPU 与增强层），保留其余 NAL：

```java
while (read >= 0 && read < inputBytes) {
    int payload  = read + startCodeLength(scratch, read, inputBytes);   // 3 或 4 字节起始码
    int nextStart = findStartCode(scratch, payload + 2, inputBytes);
    int end = nextStart < 0 ? inputBytes : nextStart;
    int nalType = (scratch[payload] >> 1) & 0x3F;                       // HEVC 2-bit 头
    if (nalType == 62 || nalType == 63) removed++;                      // ★ RPU / EL
    else write = copyKeptRange(read, end, write);
    read = nextStart;
}
if (removed == 0) return 0;         // 没剥到东西就原样返回，避免空输入给解码器
```

- 起始码长度 3 或 4 字节（`00 00 01` / `00 00 00 01`）。
- **畸形尾字节必须保留**（`copyKeptRange`），否则过滤后会产出空解码输入。
- `scratch` 数组只在遇到更大访问单元时扩容，之后复用（播放期不分配）。
- 剥离后需**补齐 HDR 元数据**（`mastering-display` / `max-cll` / `maxfall`），
  否则部分电视不激发 HDR 模式。

##### 5.8.2.5.1 DV 版的元数据注入做法（比「补字符串」更可靠）

DV 版不是往 URL 后拼 metadata 参数，而是**直接改 ExoPlayer 的 `Format`**
（`SystemCodecPlayer.java:1704-1758`）：给 HEVC 轨注入

- `ColorInfo.colorTransfer = COLOR_TRANSFER_ST2084`（PQ）
- `ColorInfo.colorSpace = BT2020`
- `ColorInfo.colorRange = LIMITED`
- **25 字节 CTA-861.3 静态 HDR 元数据**（`hdrStaticInfo`）

配套 `HdrOutputManager` 调 `Display.setColorMode(COLOR_MODE_HDR)`，
**从不改屏幕亮度**（亮度仍由设备/用户控制）。这条路径比「在 m3u8 URL 上加 query」可靠，
因为不依赖源站配合。

##### 5.8.2.6 流探测字节预算（`VideoStreamProbe` 常量，可直接抄）

| 场景 | 字节数 |
| --- | --- |
| 默认探测 | 1 MiB |
| 本地代理探测 | 8 MiB |
| 32 位电视代理启动探测 | 512 KiB |
| Java64 代理快速探测 | 512 KiB |
| 32 位电视代理深度探测 | 24 MiB |
| Matroska tracks 目标 | 256 KiB（最大 8 MiB，重开余量 64 KiB） |
| 样本探测 | 192 KiB |
| HLS 播放列表探测 | 512 KiB |
| HLS 分片探测 | 2 MiB |
| 最大视频样本探测次数 | 6 |

`Result` 暴露字段（第三方实现应产出同构结果）：
`probed` / `hasDolbyVision` / `hasHdr10` / `hasHdr10Plus` / `isMatroska` /
`dolbyVisionProfile` / `hasHdr10BaseLayer`（构造时强制 `hasHdr10BaseLayer ||= (hasDolbyVision && hasHdr10)`）/
`primaryVideoMime` / `primaryAudioMime` / `hasAvcVideo` / `hasHevcVideo` /
`hasAc3Audio` / `hasEac3Audio` / `hasDtsAudio` / `hasTrueHdAudio` /
`hasAtmosLikeAudio` / `audioTrackCount` / `subtitleTracks` / `summary`。
探测失败返回 `probed=false`，由调用方按 SDR 处理。

##### 5.8.2.7 HDR 字幕与窗口模式（易漏的工程细节）

- 识别到 HDR 视频轨后，**主动请求 Android 系统 HDR 窗口模式**；亮度仍由设备控制。
- 文本字幕在 HDR 下**必须迁到应用自己的叠加层**，用中性灰（`RGB 232`→后版本 `RGB 224`）
  加黑色描边；否则 Android 原生字幕渲染器会把字显示成纯白。
- **PGS / VobSub 位图字幕保持设备位图路径**，不迁层、不改色。
- SDR 内容保留字幕文件自身的颜色/字体/大小/位置与标记样式。
- 「晚识别到 HDR」时（已选文本字幕），要把已渲染的字幕迁移到叠加层。
- 右下角播放菜单显示时，右上角同步显示 `HDR` / `SDR` 角标，隐藏菜单时收回。

##### 5.8.2.8 本地播放代理端口与 Range 窗口

- DV 版另有本地播放代理路径 **`6677/proxy/play`**（与 §5.9 的 9978 管理/代理端口不同）。
- 单一前台 Range 读取链：首包与前台窗口 **8 MiB**，最大窗口 **16 MiB**，
  不与后台预读竞争；视频仍以 Range 方式读取，**不按整个文件大小申请内存**（32 位低堆设备关键）。
- 已确认的坑：该代理偶发返回「PNG 文件头 + EBML 视频头」的污染正文，
  以及**八字节异常 Range 响应**；正确做法是识别并丢弃整段错误响应后重试原始 Range。
- 短包、空包、错位响应与 `416` 严格重试，**不把错误响应缓存成窗口**。
- 恢复进度 / 连续 seek / 数据源重建时要传递已确认文件长度，避免临时 416 与 0% 假进度。

**6677 端点的判定与超时**（`LoopbackRangeDataSource.isLoopbackProxyPlayUrl`）：

```java
("127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host))
    && uri.getPort() == 6677
    && path.contains("/proxy/play/")      // ★ 路径必须含 /proxy/play/
```

配套超时（`SystemCodecPlayer`，**与 9978 代理不同**）：

| 项 | 值 | 原因 |
| --- | --- | --- |
| 连接超时 | **20s** | 网盘代理建连慢 |
| 读取超时 | **60s** | 6677 以 chunked Range 从远端网盘吐字节，15s 不活动会误杀有效慢窗口 |
| UA | `TVBox-SystemCodec/0.2.7` | |
| 源重试 | 有限次 + **1s 退避** | 瞬时 `HttpDataSourceException`（错误码 2000–2999）视为「源抖动」非解码失败，从上次位置续 |

> ⚠️ **HLS 代理不要盲目重试**：受控 HLS 代理已在内部跨连接 / DNS 路由重试过分片，
> 外层再 `prepare` 同一播放列表只会再次请求同一个缺失分片，造成黑屏 / 重载循环。
> 正确做法是「直连 Range VOD 才重试，HLS 的 HTTP 响应失败抑制重试」。

#### 5.8.3 外部播放器投递（`player/thirdparty/`，`pl` 编码）

除内置三内核外，M3 支持把当前播放**转交给外部播放器**，编码存于设置（`pl`）：

| `pl` | 播放器 | 包名 | headers 传递方式 |
| --- | --- | --- | --- |
| 10 | MX Player（Pro / AD 两个包名） | `com.mxtech.videoplayer.pro` / `.ad` | 拼进 URL：`url\|k=v&k2=v2` |
| 11 | Reex | `xyz.re.player.ex` | Intent extra `reex.extra.http_header`（**JSON**） |
| 12 | Kodi | `org.xbmc.kodi` | 拼进 URL：`url\|k=v&k2=v2` |
| 13 | 附近 TVBox | — | HTTP `do=push`（见 §5.13.5） |
| 14 | VLC | `org.videolan.vlc` | **不传 headers** |

- `pl` 的其它值：`1`=IJK、`2`=EXO，**其它一律兜底 EXO**。
- `pr`：`0`=TextureView、`1`=SurfaceView。
- **软/硬解不是运行时开关**，而是切换**两组内置 IJK option**（「软解码」「硬解码」），
  见 `ApiConfig.java:958-998`——第三方实现若做设置页，应做成「解码配置组」而非布尔开关。
- 音轨/字幕轨选择统一走 `TrackInfo` / `TrackInfoBean`：
  EXO 用 `SelectionOverride`，IJK 用 `selectTrack`；
  语言归一化到 `国语 / 粤语 / 英语 / 日语 / 韩语 / 泰语` 六类；**位图字幕两边都跳过**。
- EXO 的字幕延迟用**动态代理**拦截 `render(positionUs)`，把时间轴整体前移 `delayUs`——
  比「改字幕文件时间戳」更准，且即时生效。

### 5.9 本地代理（Proxy）

- 默认端口 **9978**，被占用时递增直到 9999（`RemoteServer.serverPort`）。
- 代理 URL：`http://127.0.0.1:9978/proxy?do=js&siteKey=<key>&...`；
  直播走 `do=live&type=txt|m3u&ext=<base64(liveUrl)>`。
- 用途：跨域、注入 Referer/UA、改写 m3u8、WebDAV/Samba 转发、AList 续签、DoH 转发（`/dns-query?name=`）。
- 配置里 `proxy://` 前缀的 URL 会被替换成本地代理地址。

### 5.10 迅雷/BT 播放（Thunder）

`isSupportUrl` 支持 `magnet:`、`thunder://`、`.torrent`、`ed2k://`。
客户端解析种子文件、选取最大视频文件、下载到缓存后本地播放。

### 5.10.1 其它私有 URL scheme（DV 版实测）

DV 版还识别一批私有 scheme，第三方实现若不认会把它们当普通 URL 直接丢给播放器而失败：

| scheme / 前缀 | 用途 |
| --- | --- |
| `push://` | 推送到「附近 TVBox」；配套 `push_agent` 字段指定代理 |
| `tvbox-xg:` | 玩抽 / 荐片网关（TVBox 自家的资源路由协议） |
| `data:application/dash+xml;base64,` | **内联 DASH manifest**：MPD 直接 Base64 内嵌在 URL 里，无需网络请求 |
| `magnet:` / `thunder://` / `.torrent` / `ed2k://` | 见 §5.10 |
| `img+` 前缀 | 「加密图片」：用正则 `[A-Za-z0-9]{8}\*\*` 定位，取其后 Base64（`URL_SAFE` + `NO_WRAP`）解码（`ApiConfig.java:406-431`） |

> `data:application/dash+xml;base64,` 这条最实用：它让「爬虫动态生成的 MPD」可以不走 HTTP
> 直接喂给 ExoPlayer。第三方实现应在起播前识别该前缀并解码成临时 manifest。

### 5.11 播放进度上报与本地数据

| 端点 | 用途 |
| --- | --- |
| `POST /Sessions/Playing/Progress` | 上报播放进度（ ticks ） |
| `POST /Sessions/Playing/Stopped` | 上报停止 |
| `POST /Users/{userId}/PlayedItems/{itemId}` | 标记已看 |
| `POST /Users/{userId}/FavoriteItems/{itemId}` | 收藏 |
| `DELETE /Users/{userId}/Items/{itemId}/Rating` | 删除评分 |

客户端本地还维护：观看历史（VodRecord）、收藏（VodCollect）、搜索历史、配置历史（多套配置切换）。

### 5.12 弹幕与字幕

- 弹幕文件为 XML（bilibili 格式，`<d p="time,type,size,color,timestamp,pool">text</d>`）。
- 实时弹幕：`playerContent` 返回 `danmaku:[{name,url}]`，其中 `url` 由 `danmakuUrl(id)` 生成，
  客户端回调该站点的 `danmaku(id, emit)`。
- 字幕：`subs[].format` 为 MIME（由扩展名 `srt/ass/ssa/vtt` 转换）；`flag=1` 默认选中，`flag=2` 强制。

#### 5.12.1 字幕引擎支持格式（TVBoxOS-M3 实测）

`TVBoxOS-M3/app/src/main/java/com/github/tvbox/osc/subtitle/` 是一套完整的字幕解析与渲染层，
覆盖 5 种格式，第三方实现可直接照抄（`format/` 下每格式一个类，统一实现
`TimedTextFileFormat`）：

| 类 | 格式 | 说明 |
| --- | --- | --- |
| `FormatSRT` | `.srt` | SubRip |
| `FormatASS` | `.ass` | Advanced SubStation Alpha |
| `FormatSCC` | `.scc` | Scenarist Closed Caption |
| `FormatSTL` | `.stl` | EBU STL |
| `FormatTTML` | `.ttml` | Timed Text Markup Language |
| `FormatVTT` | `.vtt` | WebVTT（**仅 DV 版有，M3 无此类**） |

> 🐞 **已知 bug：`.ttml` 走的是 `FormatSTL` 而不是 `FormatTTML`**
> （`SubtitleLoader.java:283-292` 的分派表把 `.ttml` 映到 `FormatSTL`），
> `FormatSCC` 与 `FormatTTML` 两个类虽存在但**从未被分派**。
> 第三方实现若照抄分派表会继承这个 bug；正确做法是 `.ttml` → `FormatTTML`。

- 模型：`TimedTextObject` → `Subtitle`（`Region` + `Style` + `Time`）。
- 解析失败走 `FatalParsingException`；加载结果封装为 `SubtitleLoadSuccessResult`。
- 渲染：`SimpleSubtitleView` + `UIRenderTask`，`DefaultSubtitleEngine` 用 **100ms 刷新 + 二分查找**
  定位当前 cue；任务调度用 `TaskExecutor`/`DefaultTaskExecutor`（`AppTaskExecutor` 是 App 级单例）。
- 文件发现：`SubtitleLoader` / `SubtitleFinder`，入口接口 `SubtitleEngine` /
  `DefaultSubtitleEngine`（**策略模式，可替换**）。
- DV 版另有 `SubtitleFilePicker`：可从系统文件选择器浏览内部/已挂载存储，
  **手动选择外挂字幕不要求与视频同名**。
- **加载顺序**：字幕缓存 → `playSubtitle`（播放响应里的 `subs`）→ 内嵌轨
  （EXO 取 Cue / IJK 选轨，优先 `国语`）。
- ⚠️ **`assrt` 顶层配置键不存在**（M3 不读）；字幕站是**硬编码的 HTML 爬取**
  （`secure.assrt.net/sub/`），Referer 固定。第三方实现不要指望用配置换字幕站。

##### 5.12.1.1 在线字幕搜索（DV 版硬编码爬取）

DV 版的在线字幕是**无 key 的网页抓取**，选择器写死：

```
GET https://secure.assrt.net/sub/?searchword=<关键词>&sort=rank&page=<n>&no_redir=1
```

- 用 Jsoup 解析结果页；请求带固定 `Referer`。
- 本地字幕文件上限 **8 MiB**。
- 支持 `content://` URI（系统选择器选中的字幕）。
- 格式判定：**先按扩展名**（`.srt/.ass/.ssa/.stl/.scc/.ttml/.vtt`），
  扩展名不认识时**按顺序逐个试解析器**。

**HDR 字幕样式决策**（`SubtitleHdrStylePolicy.shouldApplyHdrStyle(hasDefinedStyle, rawText)`）——
什么情况下才允许用应用的「中性灰 + 黑描边」覆盖字幕源样式：

```java
if (hasDefinedStyle) return false;                 // 字幕自带样式 → 一律不覆盖
if (rawText == null || rawText.isEmpty()) return true;
return !ASS_OVERRIDE.matcher(rawText).find()       // \{\\xxx\} ASS 覆盖标签
    && !MARKUP.matcher(rawText).find()             // <font|span|b|i|u|s|strike|ruby|rt|rp|v|c|lang|br|style|em|strong|small|big|sup|sub>
    && !WEBVTT_CUE_CLASS.matcher(rawText).find();  // <c.xxx> WebVTT cue class
```

即：**只有「无源样式的纯文字 cue」才套 HDR 中性灰**；任何源样式或已识别标记都走源样式路径。
PGS/VobSub 位图字幕始终走设备位图路径，不迁层、不改色。

#### 5.12.2 弹幕（danmaku）完整解析规范

TVBoxOS-M3 的 `com.github.tvbox.osc.bean.Danmu` 给出了**带三级兜底与脏 XML 修复**的
弹幕解析实现，是第三方实现最容易踩坑的一块（大量源返回的 XML 实体是非法的）。

##### 5.12.2.1 文件格式

```xml
<i>
  <d p="12.345,1,25,16777215,1700000000,0,abc,123">弹幕文本</d>
  <d p="30.0,4,25,16777215,1700000000,0,abc,124">底部弹幕</d>
</i>
```

- 根容器 `<i>`（也可缺省，见兜底逻辑）。
- `p` 为逗号分隔，**第 1 段是时间（秒，可为小数）**，第 2 段类型、第 3 段字号、第 4 段颜色……
  （即 bilibili `time,type,fontsize,color,timestamp,pool,sender,dbid`）。
- 时间换算：`(long)(Float.parseFloat(p.split(",")[0]) * 1000)` → **毫秒**。
  解析失败返回 `Long.MIN_VALUE`（视为时间 0，会被 `startPosition` 过滤掉）。
- 弹幕正文 = `<d>` 与 `</d>` 之间的原文（DOTALL，可跨行）。

##### 5.12.2.2 三级解析兜底（顺序不可乱）

```java
long position = Math.max(0, startPosition);
if (position > 0) {                        // ① 有起播位置：先走正则快路径
    parseByTag(danmu, xml, position, cancelChecker);
    if (!danmu.data.isEmpty()) return danmu;
}
String fixedXml = escapeIllegalEntities(xml);   // ② 修复非法实体后走 XmlPull
if (parseByXmlPull(danmu, fixedXml, position, cancelChecker)) return danmu;
danmu.data.clear();
parseByTag(danmu, xml, position, cancelChecker); // ③ 最后退回原始 XML 的正则
```

| 级 | 方法 | 正则 / 解析器 |
| --- | --- | --- |
| ① | `parseByTag` | `(?i)<d\s+[^>]*\bp\s*=\s*(['\"])(.*?)\1[^>]*>(.*?)</d>`（`DOTALL`） |
| ② | `parseByXmlPull` | `Xml.newPullParser()`，取 `<d>` 的 `p` 属性与 `nextText()` |
| ③ | `parseByTag` | 同 ①，但用**未修复**的原始 XML |

- ② 的前提是先做 `escapeIllegalEntities`（见 5.12.2.3），否则脏 XML 会让
  XmlPull 抛异常直接失败。
- ② 成功后**不再**跑 ③；② 失败则**清空**已解析结果再跑 ③，避免半份数据。
- 起播位置过滤：`startPosition > 0` 时只保留 `getTime(p) >= startPosition` 的弹幕
  （续播时跳过已看部分）。

##### 5.12.2.3 非法 XML 实体修复（`escapeIllegalEntities`）

```java
for (int i = 0; i < length; i++) {
    if (xml.charAt(i) == '&' && !isLegalEntity(xml, i + 1)) { firstIllegalEntity = i; break; }
}
// 从第一个非法 & 起，把每个非法 & 替换成 &amp;
```

`isLegalEntity(text, start)` 判定 `&` 之后到第一个 `;` 之间（**长度 ≤ 10**）是否是合法实体：

| 合法形态 | 例 |
| --- | --- |
| 五个命名实体 | `amp` `lt` `gt` `quot` `apos` |
| 十进制字符引用 | `#12345` |
| 十六进制字符引用 | `#x1F600` / `#X1f600` |

> 这是**必需的**：弹幕文本里常见的 `&`、`&nbsp`（无分号）、`&param` 都会让标准 XML 解析器
> 直接抛 `XmlPullParserException`。修复策略是「只转义非法的 `&`，合法的原样保留」，
  避免二次转义把 `&amp;` 变成 `&amp;amp;`。

- `decodeXmlString`（正则路径用）：按 `&amp; &quot; &apos; &gt; &lt;` 顺序替换
  （**`&amp;` 必须第一个**，否则 `&amp;lt;` 会被解错）。

##### 5.12.2.4 弹幕搜索 API（第三方接入点）

`DanmakuApi`（`app/.../api/DanmakuApi.java`），`baseUrl` 为用户配置的弹幕源：

| 端点 | 用途 |
| --- | --- |
| `GET {base}/api/v2/search/episodes?anime=<URLEncoder(Trans.t2s(name))>` | 按番剧搜剧集（**先繁转简**） |
| `GET {base}/api/v2/search/anime?keyword=<encode(name)>` | 按关键词搜番剧 |
| `GET {base}/api/v2/bangumi/{animeId}` | 取番剧详情 |
| `GET {base}/api/v2/comment/{episodeId}?format=json` | 取该集弹幕（JSON） |
| `POST {apiUrl}` body `name=…&episode=…` | **旧版接口**（表单两个字段） |

- 内置默认源：`https://logvardanmu.konfan.cn/87654321`（超时 20s，最多重试 2 次）。
- `baseUrl` 规范化：去掉尾部 `/`；若以 `/danmaku` 结尾则去掉该段；若以 `/87654321` 结尾也去掉。
- **自定义弹幕源的三种形态**（`DanmakuApi.java:424-460`，都要支持）：
  1. 带占位符：`…?anime={name}&episode={episode}`；
  2. 以 `/danmaku` 结尾：当作弹幕 API 基址；
  3. 其它：当 base URL，拼 `/api/v2/...` 路径。
- **集号降级**：先带数字集号搜，失败退化为不带 `episode` 再搜一次。
- JSON → XML 回填：把 `{"danmaku":[{"p":…,"text":…}]}` 组装成 `<i><d p="…">…</d></i>`，
  期间对 `p` 做 `normalizeDanmakuParam`（`split(",")` 少于 4 段则原样保留，否则重建），
  文本与 `p` 都做 XML 转义。
- 搜索请求带 `searchSeq`（`AtomicInteger`）序号，**过期响应丢弃**（防串台）。
- 底层解析器按 `split(",", 5)` 取前 4 段（`Parser.java:325-355`）。

##### 5.12.2.5 弹幕显示设置键

`danmu_open`（开关）、`danmu_max_line`（最大行数）、`danmu_speed`（速度）、
`danmu_alpha`（透明度）、`danmu_size_scale`（字号缩放）、`danmu_random_color`（随机颜色）、
`danmu_api`（弹幕源地址）。
实时弹幕（WebSocket 推送）见 §7.8 的 `danmaku(id, emit)`，与本节的「文件型弹幕」是两条独立路径。

### 5.13 DLNA / UPnP 投屏

TVBoxOS-M3 用 **Cling**（`org.fourthline.cling`）实现投屏，协议面完整且可独立复现。
第三方实现不必引入 Cling，按下面的消息序列自己写即可。

#### 5.13.1 设备发现

| 项 | 值 |
| --- | --- |
| 搜索目标 | `STAllHeader()`（即 `ssdp:all`） |
| 设备类型过滤 | `UDADeviceType("MediaRenderer", 1)` |
| 服务类型 | `UDAServiceType("AVTransport", 1)` |
| 设备标识 | `RemoteDevice.getIdentity().getUdn().getIdentifierString()` |
| 服务定位 | `remoteDevice.findService(AVT_TYPE)` |
| 组播 | Android 需 `WifiManager.MulticastLock`，用完释放 |
| 服务绑定 | `AndroidUpnpServiceImpl`（`DLNACastService`），`onServiceConnected` 后 `search()` |

回调：`DefaultRegistryListener.remoteDeviceAdded/Removed`，按 `implementsVersion(RENDERER_TYPE)`
过滤；`getDevices()` 返回当前列表。UDN 是设备的稳定 ID，UI 用它标识设备。

#### 5.13.2 投屏动作序列（严格顺序，前一步 success 才发下一步）

```
① SetAVTransportURI(service, url, metaData)   ← DIDL-Lite，见 5.13.3
      ↓ success
② Play(service)
      ↓ success
③ position > 0 ? Seek(service, SeekMode.REL_TIME, "HH:MM:SS")   ← 失败只记日志，不中断
```

- ② 的失败会中断（`postFail`）；③ 的失败**被忽略**（`Seek ignored`），因为不是所有
  MediaRenderer 都支持 REL_TIME seek。
- `control == null || service == null` → 直接失败，提示「设备离线」。
- 全部回调 post 回主线程（`mainHandler.post`）。

#### 5.13.3 DIDL-Lite 元数据（可直接抄的模板）

```xml
<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
           xmlns:dc="http://purl.org/dc/elements/1.1/"
           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
  <item id="0" parentID="-1" restricted="0">
    <dc:title>影片名</dc:title>
    <dc:creator></dc:creator>
    <upnp:class>object.item.videoItem</upnp:class>
    <dc:description>{"User-Agent":"okhttp","Referer":"https://x.com"}</dc:description>
    <res protocolInfo="http-get:*:video/*:*">https://cdn/1.m3u8</res>
  </item>
</DIDL-Lite>
```

**关键 hack**：`res` 元素无法携带 HTTP 请求头，所以 TVBox 把播放头**序列化成 JSON 塞进
`<dc:description>`**。第三方实现要兼容存量 TVBox 投屏目标时，应在接收端从
`dc:description` 解析 JSON 并作为请求头；同时应知道**这不是 UPnP 标准**，
普通 DLNA 渲染器会忽略该字段。

- XML 转义必须做：`& < > ' "` → `&amp; &lt; &gt; &apos; &quot;`（顺序：先 `&`）。
- `protocolInfo` 固定 `http-get:*:video/*:*`（HTTP GET + 任意视频容器）。
- 元数据构造失败时返回空串，`SetAVTransportURI` 仍发出（部分渲染器接受空 metadata）。

#### 5.13.4 传输层（自研部分，两个类）

TVBoxOS-M3 **替换了 Cling 默认的 JDK HTTP 传输**，这是投屏稳定性的关键：

| 类 | 作用 |
| --- | --- |
| `OkHttpStreamClient extends AbstractStreamClient` | 用 OkHttp 发 SSDP/SOAP 请求；按 `StreamRequestMessage.getOperation().getHttpMethodName()` 选方法；`requiresBody()` 决定是否带 body；响应头逐个 `headers().names()` 回填；`Call` 可 `abort()` |
| `SocketHttpStreamServer implements StreamServer` | 裸 `ServerSocket` 实现 Cling 的 **UPnP 消息入口** |

> ⚠️ **`SocketHttpStreamServer` 不是媒体文件服务器**。它的 `run()` 只做
> `accept()` → `router.received(new SocketUpnpStream(...))`，把收到的 UPnP 消息喂回
> Cling 的 `Router`——用途是**接收 GENA 事件订阅回调**（LastChange 等），
> 播放内容由渲染器直接从 §5.13.3 的 `<res>` URL 拉取。
> 监听端口取 `networkAddressFactory.getStreamListenPort()`（Cling 默认 **49152**），
> 实际端口由 `getPort()` 返回 `serverSocket.getLocalPort()`（**动态**，别硬编码）。
> `accept()` 后设 `socket.setSoTimeout(30000)`，请求行按 `ISO-8859-1` 逐行读。

- UA 值由 `ServerClientTokens(major, minor)` 生成，显式设 `OsName="Android"`、
  `OsVersion=Build.VERSION.RELEASE`——某些渲染器会按 UA 决定是否返回媒体信息。

#### 5.13.5 「附近 TVBox」不是 DLNA（易混淆）

M3 的 `player/thirdparty/RemoteTVBox.java` 实现了一套**独立的 HTTP 探活协议**，
UI 上可能和 DLNA 设备列在一起，但机制完全不同：

- 扫描本机所在 C 段（`localIp` 去掉最后一段）的 `1..255`，**跳过自己**，端口固定 **9978**。
- 对每个 IP `POST http://<ip>:9978/action`，**响应体恰为 `"ok"`（忽略大小写）** 即判定为一台 TVBox。
- 命中后把 `<ip>:9978` 存入 `Hawk(REMOTE_TVBOX)`，之后 `POST <host>/action` 投播。
- 共 254 个并发请求，用 `AtomicInteger` 统计 `finishedNum`/`foundNum`。

**`/action` 协议（POST，参数 `do=`）**：

| `do` | 附加参数 | 行为 |
| --- | --- | --- |
| `search` | `word` | `onTextReceived(word.trim())` → 远程搜索 |
| `api` | `url` | `onApiReceived(url.trim())` → 换点播配置 |
| `liveApi` | `url` | `onLiveApiReceived(url.trim())` → 换直播配置 |
| `danmuApi` | `url` | `onDanmuApiReceived(url.trim())` → 换弹幕源 |
| `push` | `url` | `onPushReceived(url.trim())` → 推送到播放器 |

- 无论 `do` 是否匹配，都返回 `createPlainTextResponse(OK, "ok")`；
  `do` 为空或 `DataReceiver` 为 null 时**也返回 `"ok"`**——所以 `"ok"` 只证明「这是台 TVBox」，
  不证明动作被执行。
- 第三方客户端要实现「被其它 TVBox 发现」，只需在本地 HTTP 服务的 `POST /action`
  上返回纯文本 `ok`（见 §8.8 的 `DataReceiver`）。

---

## 6. 直播协议

### 6.1 `lives[]` 的三种形态

**形态 A：源描述符（两个参考仓库都用这种）**

```jsonc
"lives": [
  {"name":"live","type":0,"url":"./tvlive/tvlive.txt","playerType":1,
   "epg":"http://epg.112114.xyz/?ch={name}&date={date}",
   "logo":"https://epg.112114.xyz/logo/{name}.png"},
  {"name":"B站直播","type":0,"url":"./lib/bililive.m3u","playerType":2,
   "timeout":10,"ua":"okHttp/Mod-1.5.0.0"}
]
```

**形态 B：内联分组（经典格式）**

```jsonc
"lives": [
  {"group": "央视_密码", "channels": [
     {"name":"CCTV1","urls":["http://a.m3u8","http://b.flv$备用源"]}
  ]}
]
```

**形态 C：`proxy://` 远程直播**（`lives` 数组里出现 `proxy://` 时整体走本地代理拉取）

**源描述符字段全表**（`engine/bean/Live.java`）：

| 字段 | 说明 |
| --- | --- |
| `name` | 源名称（主键） |
| `url` | 直播列表地址（txt/m3u/JSON），相对配置 URL 解析 |
| `api` | 非空时调用爬虫的 `liveContent(url)` 而不是 HTTP 拉取 |
| `ext` | 传给爬虫的扩展参数 |
| `jar` | 站点级爬虫包 |
| `click` | WebView 点击脚本 |
| `logo` | 台标模板，`{name}` 占位 |
| `epg` | EPG 模板，`{name}`/`{date}` 占位 |
| `ua` / `origin` / `referer` | 播放请求头 |
| `timeZone` | 时区（EPG 时间换算） |
| `keep` | 保持连接 |
| `timeout` | 超时（秒） |
| `header` | 请求头对象 |
| `catchup` | 回看配置 `{type,source,replace}` |
| `core` | 内核相关配置 |
| `groups` | 内联分组（形态 B） |
| `boot` | 开机自启动 |
| `pass` | 分组密码开关 |

> **重要**：现代引擎的 `Live` bean **没有 `type` 与 `playerType` 字段**——这两个字段被容忍但忽略。
> 直播列表的格式（txt 还是 m3u）由**内容嗅探**决定，见 §6.3。

**但 `ApiConfig` 层确实读 `lives[].type`**（DV 版 `ApiConfig.java:919-935`，M3 亦有）——
这是两个不同的层次，别混淆：

```java
String type = livesOBJ.get("type").getAsString();
if (type.equals("0") || type.equals("3")) {
    url = livesOBJ.has("url") ? livesOBJ.get("url").getAsString() : "";
    if (url.isEmpty()) url = livesOBJ.has("api") ? livesOBJ.get("api").getAsString() : "";
    if (!url.startsWith("http://127.0.0.1")) {
        if (url.startsWith("http"))
            url = Base64.encodeToString(url.getBytes("UTF-8"),
                    Base64.DEFAULT | Base64.URL_SAFE | Base64.NO_WRAP);
        url = ControlManager.get().getAddress(true) + "proxy?do=live&type=txt&ext=" + url;
    }
    if (type.equals("3")) {          // ★ 爬虫直播
        String jarUrl = livesOBJ.has("jar") ? livesOBJ.get("jar").getAsString().trim() : "";
        String pyApi  = livesOBJ.has("api") ? livesOBJ.get("api").getAsString().trim() : "";
        if (pyApi.contains(".py")) { /* 走 pyLoader */ } else { /* 走 jar */ }
    }
}
```

| `lives[].type` | 含义 |
| --- | --- |
| `"0"` | txt 代理：把 `url` Base64（**`URL_SAFE` + `NO_WRAP`**）后拼成 `<本地代理>/proxy?do=live&type=txt&ext=<b64>` |
| `"3"` | **爬虫直播**：`api` 含 `.py` → Python 蜘蛛；否则 → jar 蜘蛛（可同时给 `jar`） |
| 其它 / 缺失 | 走默认的 txt/m3u 内容嗅探路径 |

> 注意 `type=txt` 在 `type=="3"` 时**仍然硬编码为 `txt`**——代理端拿到的容器提示不反映真实格式。
> 另外 DV 版把 `type` 为 `"1"`/`"2"` 的分支写成 `clear()+return`（**清空直播列表并返回**），
> 无注释无样例，语义不明——第三方实现应按「未知 type 当作默认嗅探」处理，不要清空。

**嵌套与继承**（`LiveConfigCompat`）：`groups[]` 可递归嵌套子分组；
分组级 `header`/`ua`/`referer`/`origin`/`epg` 会被子级继承；
频道级 `epg` 若不含 `://`、`/`、`{` 且不以 `.xml` 结尾，则被视为 `tvg-id`（台标映射）。

### 6.2 txt 直播源格式

```text
电视频道,#genre#
CCTV1,http://112.123.243.37:50085/tsfile/live/0001_1.m3u8?key=txiptv&playlive=0&authid=0
CCTV2,http://113.90.154.189:9901/tsfile/live/0002_1.m3u8?key=txiptv
湖南卫视,http://183.94.146.79:9901/tsfile/live/0128_2.m3u8#http://backup.example.com/hn.m3u8
广东体育,http://1.2.3.4/live.ts|user-agent=okhttp/4.9&referer=https://x.com
```

规则（`TxtSubscribe.parse` + `LiveParser.txt`）：

- 一行一个频道：`频道名,URL`
- `URL` 内可用 `#` 分隔多个备用地址
- `URL` 后可用 `|` 跟请求头：`|key=value&key2=value2`
- `分组名,#genre#` 切换到新分组；未分组的频道归入「未分组」
- 只有以 `http`/`rtp`/`rtsp`/`rtmp` 开头的地址被接受，其它协议被忽略
- 空行与 `#` 开头的行被忽略
- 注意：`$` 后缀（源名）在 txt 格式中**不会被剥离**（参考仓库 43/50 条带 `$LR—IPV4`）

### 6.3 m3u 直播源格式

```text
#EXTM3U x-tvg-url="https://epg.example.com/e.xml" catchup="append" catchup-source="?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}"
#EXTINF:-1 tvg-id="CCTV1" tvg-name="CCTV1综合" tvg-logo="http://logo/1.png" group-title="央视频道",CCTV1综合
http://111.8.242.104:8088/tsfile/live/1020_1.m3u8|user-agent=okhttp
#EXTINF:-1 tvg-chno="5" group-title="央视频道",CCTV5体育
http://...
#EXTGRP:卫视频道
#EXTINF:-1,湖南卫视
http://...
#EXTVLCOPT:http-user-agent=okhttp/4.9
#EXTVLCOPT:http-referer=https://www.example.com/
#KODIPROP:inputstream.adaptive.manifest_type=hls
```

**格式判定（硬规则）**：`LiveParser` 用正则 `^(?!.*#genre#).*#EXTM3U.*`（MULTILINE）判断——
匹配则按 m3u 解析，否则按 txt 解析。**所以扩展名会说谎，内容不会**：
参考仓库里 `interface.txt` 实际是 m3u、`live.m3u` 实际是 txt，两者都能正常工作。

**m3u 属性与指令**（`LiveParser.m3u` + `LivePlaylistMetadata`）：

| 属性/指令 | 说明 |
| --- | --- |
| `#EXTM3U` 的 `x-tvg-url` / `url-tvg` / `tvg-url` | 全局 EPG 地址（取第一个 `,` 前的部分） |
| `#EXTM3U` 的 `catchup` / `catchup-source` / `catchup-replace` | 全局回看配置 |
| `#EXTINF` 的 `tvg-id` | 台标/EPG 映射键 |
| `tvg-name` | 频道显示名 |
| `tvg-logo` | 台标 URL |
| `tvg-chno` | 频道号 |
| `group-title` | 分组名（支持 `"..."`、`'...'`、裸值，大小写不敏感） |
| `http-user-agent` | 该频道 UA |
| `#EXTGRP:名称` | 覆盖紧随其后的 `#EXTINF` 分组 |
| `#EXTVLCOPT:http-cookie/http-origin/http-user-agent/http-referrer` | VLC 风格选项 |
| `#KODIPROP:inputstream.adaptive.license_key/license_type/manifest_type/stream_headers` | Kodi 风格选项（含 DRM） |
| 播放行 | `URL` 或 `URL\|k=v&k2=v2`（头信息） |

**属性解析正则**：`(?:^|\s)key\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))`，大小写不敏感。
频道名取 `#EXTINF` 行中**第一个引号外的逗号**之后的文本。

### 6.4 回看（catchup / timeshift）

**m3u 层属性**：`catchup="append"` + `catchup-source="?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}"`
或 `catchup-source="&playbackbegin=${(b)yyyyMMddHHmmss}&playbackend=${(e)yyyyMMddHHmmss}"`。

**`Catchup` 字段**（`engine/core/.../bean/Catchup.java:15-132`）：

| 字段 | 说明 |
| --- | --- |
| `type` | `append`（默认，拼在 URL 后）/ `default`（整段替换 URL） |
| `source` | 时间模板：`?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}` |
| `regex` | 命中才启用（可正则） |
| `replace` | `旧正则,新串`，`append` 前先替换 |
| `days` | 可回看天数（元数据） |

**时间占位符**：`${(b)fmt}`=开始、`${(e)fmt}`=结束、`${utc:}`=开始秒、`${utcend:}`=结束秒；
`fmt` 为 `timestamp` 时输出秒。M3 另支持 `${(b)pattern}` / `${(e)pattern}` 的
**模式串**形式（`pattern` 是日期格式模式，与 `fmt` 同义，不同分支写法不同，实现时都要认）。

**默认 PLTV 规则**：URL 含 `/PLTV/` 自动套用 `/PLTV/`→`/TVOD/` +
`?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}`，7 天（`Channel.hasCatchup`）。

**爬虫层**：`playerContent` 返回 `timeshift:{url,start,window}`，`url` 由 `proxyUrl` 生成并保留 `{time}`，
客户端以目标 Unix 毫秒替换后 GET；拖到最右侧或回默认位置重新取直播源。
⚠️ 本 fork 未解析 `timeshift` 字段（见 §11.4）。

**节目单回看**仍用 `catchup`，时间轴以该节目为范围。

### 6.5 EPG 与台标

**模板变量**（`EpgService.address`，`app/.../util/epg/EpgService.java:37-49`）：

| 变量 | 取值 |
| --- | --- |
| `{name}` | `tvgName` 优先，空则 `channelName` |
| `{id}` / `{epg}` | `tvgId` 优先，空则 `name` |
| `{date}` | `yyyy-MM-dd` |
| `{logo}` | 台标专用 |

- 全部做 `URLEncoder(UTF-8)`，`+` 换成 `%20`。
- **兜底**：模板不含 `{`、不是 `.xml`/`.gz`、是 http(s)、且不含 `ch=`/`date=` 时，
  自动追加 `?ch=<name>&date=<date>`。
- 继承：频道自身 `epg` 为空才继承源级；源级模板含 `{` 且频道 epg 不是 http 时，
  执行 `{id}/{name}/{epg}` 替换（`Channel.live`）。
- 台标：源级 `logo` 含 `{` 且频道 logo 非 http 时，替换 `{id}/{name}/{logo}`。

**两种 EPG 数据源**：

1. `{` 模板 → 每频道请求一次 JSON/XML；
2. `.xml`/`.gz` → 批量 XML 下载（`LiveApi.parseXml`），即标准 XMLTV：

```xml
<tv date="20240101">
  <channel id="CCTV1"><icon src="http://logo/1.png"/><display-name>CCTV1综合</display-name></channel>
  <programme start="20240101120000 +0800" stop="20240101130000" channel="CCTV1">
    <title>新闻30分</title>
  </programme>
</tv>
```

XML 频道匹配键 = `tvgId` / `tvgName` / `name` 三者（`EpgParser.prepareLiveChannels`）。

**时区**：`timeZone` 字段用于 EPG 时间换算。

**频道号**：配置可给（`tvg-chno` / JSON `number`），空时按全局递增 `%03d` 格式化。

#### 6.5.1 频道名归一化（`XmlTvParser.normalizeChannelName`，可直接实现）

TVBoxOS-M3 的 XMLTV 解析器给出了**唯一一份可逐字节复现的归一化算法**，是把
「直播源频道名」与「XMLTV 节目单」对齐的关键。第三方实现必须照抄，否则同一频道对不上：

```java
private static final Pattern CCTV_NAME =
    Pattern.compile("(?i)^(CCTV\\d+(?:\\+|K)?)(?:[\\u4e00-\\u9fa5].*|$)");

public static String normalizeChannelName(String name) {
    if (name == null) return "";
    String trimmed = name.trim();                              // 1) 去首尾空白
    String compact = trimmed.replace("-", "").replace(" ", ""); // 2) 删所有 - 与空格
    Matcher matcher = CCTV_NAME.matcher(compact);
    if (matcher.matches()) return matcher.group(1).toUpperCase(Locale.ROOT); // 3) CCTV 特例
    return compact.toUpperCase(Locale.ROOT).startsWith("CCTV")
            ? compact.toUpperCase(Locale.ROOT) : trimmed;      // 4) CCTV 前缀保形 / 原名
}
```

规则分四步，顺序不可交换：

| 步 | 动作 | 说明 |
| --- | --- | --- |
| 1 | `trim()` | 去掉首尾空白 |
| 2 | 删除**所有** `-` 与空格（不限首尾） | `CCTV-1 综合` → `CCTV1综合` |
| 3 | 命中 `^CCTV\d+(\+\|K)?` 且其后是中文或结尾 → 只取 `CCTV…` 部分并大写 | `CCTV-5+体育赛事` → `CCTV5+` |
| 4 | 其余：大写后若以 `CCTV` 开头则返回大写形，否则返回**步骤 1 的原样 trim 结果** | `湖南卫视` 不被大写，保持中文 |

**黄金测试向量**（`app/src/test/java/.../XmlTvParserTest.java`，实现必须全部通过）：

| 输入 | 归一化结果 |
| --- | --- |
| `CCTV-1 综合` | `CCTV1` |
| `cctv-5+体育赛事` | `CCTV5+` |
| `CCTV-4K超高清` | `CCTV4K` |
| `" 湖南卫视 "` | `湖南卫视` |
| `null` | `""` |

> 注意步 4 的非 CCTV 分支返回的是**未删空格的原样 trim**，所以 `北京 卫视` → `北京 卫视`，
> 而 `CCTV1 综合` → `CCTV1`。这是"台标/EPG 匹配"与"界面显示"两套命名的根源。

#### 6.5.2 XMLTV 解析语义（SAX，含时间与过滤规则）

- **时间格式**：`yyyyMMddHHmmss Z`（带时区偏移，如 `20261107233000 +0800`）优先；
  解析失败退化为 `yyyyMMddHHmmss`（无时区），此时按 **GMT+8:00（中国时区）**解释；
  两者都失败 → 该条节目被**丢弃**（不报错）。
- **日窗口过滤**：只保留 `start < dayEnd && end > dayStart` 的节目，`dayStart` 为当天 00:00
  （GMT+8），`dayEnd = dayStart + 86_400_000`。跨午夜节目只要与该窗口有交集即保留。
- **有效性校验**：`end.after(start)` 必须成立，否则丢弃。
- **频道匹配**：`<channel id>`、`<programme channel>`、`<display-name>` 三处都过
  `normalizeChannelName` 后与目标频道比较；结果按 `channel` 属性缓存（`channelMatches`）。
- **标题**：取 `<programme>` 内**第一个非空** `<title>`（`title.isEmpty()` 守卫）。
- **安全**：SAX 关闭 `external-general-entities` / `external-parameter-entities` /
  `load-external-dtd` 三项特性，并设置空 `EntityResolver`——第三方实现必须照做，
  否则恶意 XMLTV 会触发本地文件读取/XXE。
- **取消**：解析过程可传入 `Cancellation`，每个 SAX 回调检查一次；切换频道时取消上一次请求
  （`CancellationException("EPG request superseded")`）。

### 6.6 直播源实例统计（参考仓库）

| 文件 | 频道数 | 分组 | 格式 |
| --- | --- | --- | --- |
| `repo1/tvlive/tvlive.txt` | 50 | 1（电视频道） | txt（43 条带 `$` 后缀） |
| `repo1/tvlive/live.m3u` | 60 | 1 | **内容为 txt** |
| `repo2/lib/interface.txt` | 318 条 EXTINF | 14 | **内容为 m3u**（咪咕源，含短时效鉴权参数） |
| `repo2/lib/bililive.m3u` | 1403 | 12 | m3u（含「列表更新时间」伪频道） |
| `repo2/lib/huyayqk.m3u` | 1260 | 4 | m3u |
| `repo2/lib/douyuyqk.m3u` | 956 | 4 | m3u |
| `repo2/lib/yylunbo.m3u` | 594 | 5 | m3u |
| `repo2/lib/iptv.m3u` | 119 | 4 | m3u（APTV 私有格式 + 回看） |

---

## 7. 爬虫开发规范（Java / Python / QuickJS）

> 依据 `FongMi/CatVodSpider` 的官方文档 `docs/development.md` 与三语言示例
> （`app/src/main/java/com/github/catvod/spider/Demo.java`、`examples/python/spider.py`、
> `examples/javascript/spider.js`），是新一代 CatVod 的权威规范。

### 7.1 执行环境

| 语言 | 环境 |
| --- | --- |
| Java | Java 17 语法，Android 7.0+；继承 `Spider`，`gradlew.bat spiderJar` 打包并执行 R8 |
| Python | CPython 3.10、Chaquopy 17.2.0；入口维持同步 `def` |
| QuickJS | QuickJS-NG 0.18.0；`import {Spider} from "catvod"`，默认导出继承它的类；支持 `async/await`、`?.`、`??` |

- Java SDK 以 `compileOnly` 引用：`app/libs/catvod-api.jar`（TV 的 `apiJar`）与 `quickjs-api.jar`。
- `com.github.catvod.bean` 与 `com.github.catvod.utils.Response` **随爬虫 JAR 打包**。
- QuickJS **不是 Node.js**：无 `Intl`、无 `Atomics.waitAsync`、无全局 `fetch`。
- QuickJS 辅助模块需显式从 `catvod` 导入：`net`、`local`、`js`、`dialog`、`htmlQuery`、`proxyUrl`、`link`、`page`。
- 宿主能力：`URL/URLSearchParams`、`Event/EventTarget`、`AbortController`、`structuredClone`、
  `Blob/File/FormData`、Web Streams、`TextEncoder`、多编码 `TextDecoder`（GBK/GB18030/Big5）、
  `Headers/Request/Response`、Web Crypto（SHA/HMAC/AES-GCM/CBC/JWK；**不支持 RSA/ECDSA/KDF**）、
  JSON module import、`WebAssembly`。
- GCM 密文末端含 16-byte tag，二进制明文用 Base64。

#### 7.1.1 QuickJS 引擎的可选实现（第三方落地参考）

「QuickJS 源」在 TVBox 里有**三套并存的引擎实现**，第三方可任选其一，协议
（`import ... from "catvod"` / `export default`）不变，变的是引擎库与**可用 API 集合**：

| 方案 | 库 | 许可 | 说明 |
| --- | --- | --- | --- |
| A | `wang.harlon.quickjs:wrapper-android:2.1.0` + `wrapper-java:2.1.0` | Apache-2.0 | **TVBoxOS-M3 的实际运行时**。Harlon Wang 维护的 quickjs-android fork，沿用 `com.whl.quickjs` 包名；通过一个空壳 `:quickjs` Gradle 模块 `api` 引入（`quickjs/build.gradle:33-34`） |
| B | `quickjs-android`（`com.whl.quickjs`，caoccao / Sam Cao 原版） | Apache-2.0 | 上游原版；`com.whl.quickjs.wrapper` 提供 `@JSFunction`、`@ContextSetter`、`JSUtils` |
| C | FongMi/quickjs-wrapper 产出的 `quickjs-api.jar` | — | 以 `compileOnly` 引用的 API 桩，实际实现由配套运行时 APK 提供 |

- 方案 A/B 的 `JSUtils` 是**Java↔JS 类型桥**的完整参考实现，覆盖 `Map`→`JSObject`、
  `List`/`byte[]`/数组→`JSArray`、任意 Java 值→JS 值（`toJSValue`）。
- 引擎通过 `@JSFunction` 注解自动把 Java 方法注册成 JS 全局函数；
  `@ContextSetter` 标注的 `setJSContext(QuickJSContext)` 是宿主把运行时交回 Java 的注入点。
- 选择 A/B 的好处：不依赖外部运行时 APK；代价是 APK 体积增加（`libquickjs.so` 按 ABI 分发）。
- **三套都不是 Node.js**：均无 `require`、无 `process`、无文件系统。

#### 7.1.2 ⚠️ `net` API 按引擎而变（最常见的兼容性错误）

这是第三方实现最容易踩的坑：**「TVBox JS 源能调哪些网络函数」取决于客户端用哪个引擎**，
同一份配置在不同客户端上表现不同。

**M3 的 `assets/js/lib/net.js` 全文只有 16 行**，即**只有 `req` 和 `http` 两个全局函数**：

```js
let req = (url, options) => http(url, Object.assign({ async: false }, options));
function http(url, options = {}) {
    if (options?.async === false) return _http(url, options)          // 同步
    return new Promise(resolve => _http(url, Object.assign({
        complete: res => resolve(res)
    }, options))).catch(err => ({ ok: false, status: 500, url }))     // 异步
};
```

| 引擎 | 可用网络 API |
| --- | --- |
| M3（`wang.harlon.quickjs` + 上述 `net.js`） | **仅 `req` / `http`**（`_http` 是宿主注入的底层） |
| FongMi CatVodSpider（`import {net} from "catvod"`） | `net.json/req/get/post/batch/map/download/sleep/openStream/stream/ws/connect/cached/session/getCookie/setCookie/getUserAgent` |

也就是说：**§7.5 列的整套 `net.*` 是 FongMi 引擎的 API，不是 M3 的**。
`json/get/post/batch/map/download/sleep/ws/connect/cached/session` 这些名字来自
**drpy2 的约定**（drpy2 自己实现了它们），不是 QuickJS 引擎提供的。

> **第三方实现结论**：如果你的客户端要跑存量 JS 源，必须同时提供
> ① `req`/`http`（M3 系源）；② drpy2 的那套 `get/post/json/batch/...`（drpy 系源）；
> ③ 若要跑 FongMi 官方示例，还要 `import {net} from "catvod"`。
> 三者名字空间不同，但都最终落到同一个宿主 HTTP 实现上。

#### 7.1.3 JS 模块的三种入口契约（M3 `JsSpider` 实测）

M3 的 `JsSpider` 兼容**三种**源写法，第三方加载器必须都认：

| 形态 | 识别方式 | 处理 |
| --- | --- | --- |
| **ES Module 默认导出**（主流） | `export default { … }` 或 `export default class … extends Spider` | 直接取默认导出 |
| `__jsEvalReturn` | 源里调用该函数回传对象 | 置 `cat=true` 并**预注入 `req = http`** |
| `__JS_SPIDER__ =` | 文本替换 | 把 `__JS_SPIDER__` 替换成实际对象（`JsSpider.java:298-307`、`329-336`） |

- `//bb` 与 `//DRPY` 前缀的源按**字节码**加载，`BYTECODE_VERSION = 67`（`JsSpider.java:43`）。
  字节码与引擎版本强绑定，版本不匹配会加载失败——第三方实现若支持字节码缓存，
  必须自带版本号并在不匹配时回退到源码执行。
- 运行时用**单一 `ExecutorService` 串行化所有调用**；`Async.java:30-100` 用
  `CountDownLatch` 把 Promise 展平成同步返回。所以 JS 源里写的 `async` 函数
  在宿主侧表现为同步阻塞。
- 额外注入的全局：`jsapi.*`（**来自外部 jar** 的 `com.github.catvod.js.Function`，
  `JsSpider.java:478-522`）、`muban` / `getMubans`（来自 `模板.js`）。

#### 7.1.4 `proxy` 的双通道协议（`from=catvod` 分流）

JS/PY 蜘蛛的 `proxy` 返回值格式**由请求是否带 `from=catvod` 决定**：

| 请求 | 走的通道 | 返回格式 |
| --- | --- | --- |
| 不带 `from=catvod` | `proxy1`（`JsSpider.java:538-559`） | **5 元数组** `[status, mime, body, headers, ?]` |
| 带 `from=catvod` | `proxy2`（`JsSpider.java:590-608`） | **对象** `{code, buffer, content, headers}` |

第三方客户端应同时实现两种解包：先看 `from` 参数，再决定按数组还是按对象取字段。

### 7.2 入口方法（三语言对照）

| 用途 | Java | Python | QuickJS |
| --- | --- | --- | --- |
| 初始化 | `init(context, extend)` | `init(extend)` | `init(extend = "")` |
| 分类与筛选 | `homeContent(filter)` | 同名 | 同名 |
| 推荐 | `homeVideoContent()` | 同名 | 同名 |
| 分类列表 | `categoryContent(tid, pg, filter, extend)` | 同名 | 同名 |
| 搜索 | `searchContent(key, quick, pg)` | 同名 | `searchContent(key, quick, pg = "1")` |
| 详情 | `detailContent(ids)` | 同名 | 同名 |
| 播放 | `playerContent(flag, id, vipFlags)` | 同名 | 同名 |
| 即时弹幕 | `danmaku(id, emit)` | 同名 | 同名 |
| 交互 | `action(action)` | 同名 | `async action(value)` |
| 直播 | `liveContent(url)` | 同名 | 同名 |
| 本地代理 | `proxy(params)` | 同名 | `async proxy(params)` |
| 嗅探判断 | `manualVideoCheck()` / `isVideoFormat(url)` | 同名 | 同名 |
| 释放 | `destroy()` | 同名 | 同名 |

**返回值格式**：Java 返回 JSON 字符串；Python 返回 `dict`/`list`；QuickJS 返回对象/数组
（可同步或 Promise，由 App 统一序列化）。`proxy` 与布尔接口保持各自格式。

**默认行为**（只覆写需要的入口）：首页返回空 `class`；列表返回空 `list`；播放/交互返回空对象；
直播返回空字符串；代理返回 404 与空正文。

### 7.3 数据契约

外层结构见 §4.3.5。**线路与剧集分隔符（硬约束）**：

```
线路      $$$     分隔
线路内集数  #      分隔
每集      名称$播放值
```

名称中的 `$`/`#` 必须替换（Demo 用全角 `＄`/`＃`）。

`Response` 链式方法：`classes()`/`vods()`/`filters()`/`url()`/`header()`/`vod()`/`subs()`/`danmaku()`/
`drm()`/`skips()`/`artwork()`/`desc()`/`format()`/`position()`/`page(items,page,limit[,total])`/`string()`。
`Response.create()` 默认带 `parse:0, jx:0`。

### 7.4 ext 选项表（Demo 契约）

| ext | 用途 |
| --- | --- |
| `image_base` | 封面网址前缀 |
| `web_url` / `game_url` / `cookie_name` | 一般网页 / 独立内容 / 单一登录 Cookie |
| `web_cookie` | 登录 Cookie 分组数组，取代 `cookie_name` |
| `request_url` / `request_method` / `request_headers` / `request_options` | HTTP 请求 |
| `json_url` | JSON API |
| `ws_url` / `ws_data` / `ws_headers` / `ws_idle` | WebSocket |
| `live_danmaku` | `true` 时播放响应附带实时弹幕 |
| `media_url` / `backup_media_url` | 主要/备用播放网址 |
| `media_urls` | 多画质 `{values:[{n,v}],position}` |
| `media_headers` / `backup_media_headers` / `media_format` | 播放头与格式 |
| `timeshift` | 直播回看 `{url,start,window}` |
| `subtitles` / `danmaku` / `drm` | 字幕数组 / 弹幕数组 / DRM 对象 |
| `skips` / `start_position_ms` | 跳过片段与起播位置（毫秒） |
| `sniff_url` | 未填主要播放网址时交给 App 嗅探的网页 |

### 7.5 网络 API（`net`）

时间单位毫秒。Java 的 options 除特别标示外为 JSON 字符串。

| 方法 | 说明 |
| --- | --- |
| `net.json(url, options)` | 只取 JSON；连接失败、非 2xx、无效 JSON 抛异常 |
| `net.req(url, options)` | 需要状态码/错误正文/bytes；分开检查 `error` 与 `code` |
| `net.get(url[, headers])` / `net.post(url, json, headers)` | Java 便捷方法 |
| `net.batch(requests, limit)` | 并行批次，默认最多 4 并行，按输入顺序返回 |
| `net.map(items, mapper, limit)` | 每项还需缓存/签名/解析时用；默认 4 并行 |
| `net.sleep(ms)` | 可取消 |
| `net.download(url[, path], options)` | 直接写档；`maxBytes`/`size`/`threads`(0 自动/1 单路/2..4 分段) |
| `net.openStream(url, options)` | 分块读取，返回 `{code, headers, contentType}` + reader |
| `net.stream(url \| generator, options)` | 自定义正文 |
| `net.ws(url, options)` | 单次交换，`code=101` |
| `net.connect(url, options, cb)` | 持续收讯，事件 `open/message/retry/error/close` |
| `net.cached(key, options, loader)` | TTL 缓存；`peek`/`refresh`/`clearCache` |
| `net.session()` | 隔离 Cookie/缓存会话，用完 `close()` |
| `net.getCookie(url)` / `net.setCookie(url, cookie)` | WebView Cookie 读写 |
| `net.getUserAgent()` | 取 App UA（**不会**自动加到每个请求） |

HTTP options：`headers`、`params`（数组值重复同 key）、`method`/`data`/`postType`（`json`/`form`/`form-data`）、
`body`（原始文字或 0–255 整数数组）、`buffer`（0 文字/1 byte 数组/2 Base64/3 bytes）、
`redirect`（默认 1 跟随）、`timeout`/`callTimeout`、`cookie`（`true` 用 WebView Cookie）。

TTL 缓存选项：`ttl`（必填毫秒，0 不快取）、`stale`（默认 true）、`persist`（默认 false）。

WebSocket connect 选项：`headers/params/cookie/session`、`data`/`body`、`timeout`、`ping`（默认 0 关闭）、
`idle`（默认 0 关闭）、`reconnect`（默认 false；1s 倍增至 30s，稳定 30s 后重置）。

**Local**：`get/set/delete`，Java 用 JSON 字符串，Python/QuickJS 直接存 JSON 值；清缓存不删 Local。

**js.eval(source, {globals, timeout})**：隔离环境，返回最后一个表达式的 JSON 值；`timeout` 默认 5000ms；
内置 `md5X(text)`；不提供网络、DOM 或模块导入。

### 7.6 htmlQuery（HTML 字段解析）

`htmlQuery(source, plan)` 一次解析 HTML 并回传普通对象，不发请求、不保留 DOM。

```js
const {videos} = htmlQuery(source, {queries: {videos: {
  selector: "article.video",
  fields: {id: {attribute: "data-id"}, title: {selector: "h2"}, actors: {selector: ".actor", all: true}}
}}});
```

- 字段选项：`selector`（省略读该列本身）、`attribute`（省略读文字）、`all`（默认 false）。
- 回传：缺节点/属性 → `null`；已存在的空值 → 空字符串；`all:true` 无匹配 → `[]`；
  文字按 DOM 顺序串接、不 trim、不插分隔符；属性值解码 HTML entity、不补相对 URL。
- 选择器与 entity 规则沿用 Jsoup（**不保证与 Cheerio 兼容**，class 比较不分大小写）。
- 限制：HTML ≤ 2,097,152 UTF-16 字符；序列化后 plan ≤ 16,384；queries 1..16 组、每组 fields 1..32；
  名称 1..128 字符；序列化后结果 ≤ 1,048,576。超限抛异常，不返回截断结果。

### 7.7 网页、Dialog 与本地代理

- `action` 返回 `{web:{url,mode?,cookie?}}` 开网页（`mode:"view"` 独立内容），或 `{msg:"…"}` 显示提示。
- `cookie` 分组：同组全部需要、不同组任一即可；各组可指定 `url`。
- 本地代理网址用 `proxyUrl(params, local)`：`local` 默认 `true` 用本机回环，`false` 用局域网 IP；
  App 自动加入 `do` 与 `siteKey` 并编码 query，二者是保留参数不可覆写。
- `proxy(params)` 只接收扁平的「字符串键值」集合；HTTP 入口依次合并请求参数、头与文件信息（后者覆写同名）。
- `proxy` 返回 `[status, mime, body, headers?]`，`headers` 选填；
  Java body 用 `InputStream`，Python 可用 `bytes`，QuickJS 可用字符串/byte 数组/`ArrayBuffer`/TypedArray。
- 直播返回 `[{name, channel:[{name, urls}]}]`，多线路网址加 `$线路名称`；TXT/M3U 也可直接回传文字。

**Dialog**（`dialog(options, callback)`，callback 为可选第二参数，返回 `{button, values}`）：

| 参数 | 说明 |
| --- | --- |
| `title` / `message` / `image` / `qrcode` / `copyable` / `cancelable` | 基础展示 |
| `inputs[]` | `name` 必填不重复；`label` 默认 name；`value`；`helperText`；`type` ∈ `text`(默认)/`phone`/`number`/`password`/`textarea`/`select`/`multiselect`；`options`（select/multiselect 必填非空，`value` 非空白唯一）；`enabled`；`required`；`minLength`/`maxLength`；`minItems`/`maxItems` |
| `buttons[]` | 1..3 项；`id`/`label` 必填不重复；`close` 默认 true；`enabled`；`validate` 字段名数组 |

callback 可回传 `{message, qrcode, image, values, errors, inputs, buttons, close}`；
有非空错误时保留窗口与输入值；回传 `null/None` 沿用按钮设定。

### 7.8 即时弹幕（`danmaku(id, emit)`）

- `danmaku[].url` 用 `danmakuUrl(id)` 生成；App 调用该站点的 `danmaku(id, emit)`。
- `emit` 传入 `{text, color, size, type, colors}`：`text` 必填非全空白 ≤4096 字符；
  `color` RGB 0..16777215；`size` 0..96 sp（0 跟随用户设置）；
  `type` 1 滚动/4 底部/5 顶部/6 反向；`colors` 2..8 个 RGB 组成渐变。
- 状态也用 emit：`{state:"ready"|"retrying"|"error", msg?}`，不可同时含 `text`；`msg` ≤512 字符，
  **不放 Cookie、token 或签名网址**。
- 返回值：Java `AutoCloseable`，Python/QuickJS 停止函数。

### 7.9 打包与加载

| 项 | 说明 |
| --- | --- |
| 打包命令 | 仓库根目录 `./gradlew.bat spiderJar`（执行 R8） |
| 产物 | `jar/custom_spider.jar` 与 `jar/custom_spider.jar.md5` |
| 最低支持 | Android 7.0 |
| 配置引用 | `"spider": "./jar/custom_spider.jar;md5;<md5>"` |
| 导出 | `build.bat "D:\Output"` 或传完整 JAR 路径 |

### 7.10 最小 JAR 蜘蛛骨架

```java
package com.github.catvod.spider;

import android.content.Context;
import com.github.catvod.bean.Class;
import com.github.catvod.bean.Vod;
import com.github.catvod.crawler.Spider;
import com.github.catvod.utils.Response;
import java.util.*;

public class MySite extends Spider {
    @Override public void init(Context context, String extend) { }

    @Override public String homeContent(boolean filter) {
        List<Class> classes = new ArrayList<>();
        classes.add(Class.create().id("1").name("电影"));
        return Response.create().classes(classes).string();
    }

    @Override public String homeVideoContent() {
        List<Vod> items = new ArrayList<>();
        items.add(Vod.create().id("abc").name("片名").pic("https://...").remarks("更新至1集"));
        return Response.create().vods(items).string();
    }

    @Override public String categoryContent(String tid, String pg, boolean filter, HashMap<String,String> extend) {
        return Response.page(new ArrayList<>(), Integer.parseInt(pg), 20);   // 自动切片
    }

    @Override public String detailContent(List<String> ids) {
        Vod v = Vod.create().id(ids.get(0)).name("片名")
                .playFrom("线路1$$$线路2")
                .playUrl("第1集$https://a/1.m3u8#第2集$https://a/2.m3u8$$$第1集$https://b/1.m3u8");
        return Response.create().vod(v).string();
    }

    @Override public String searchContent(String key, boolean quick) { return searchContent(key, quick, "1"); }
    @Override public String searchContent(String key, boolean quick, String pg) {
        return Response.page(new ArrayList<>(), Integer.parseInt(pg), 20);
    }

    @Override public String playerContent(String flag, String id, List<String> vipFlags) {
        if (id.startsWith("http")) return Response.create().url(id).string();          // parse=0
        return Response.create().parse().url("https://需要嗅探的网页").string();        // parse=1
    }

    @Override public Object[] proxy(Map<String,String> params) {
        return new Object[]{200, "text/plain; charset=utf-8",
                new java.io.ByteArrayInputStream("ok".getBytes())};
    }

    @Override public void destroy() { }
}
```

配套配置：

```json
{
  "spider": "./jar/my.jar;md5;<32位md5>",
  "sites": [{"key":"mysite","name":"我的站","type":3,"api":"csp_MySite","searchable":1,"ext":"{}"}],
  "flags": [], "parses": []
}
```

### 7.11 最小 QuickJS 源骨架

```js
import { Spider } from "catvod";   // 新版 SDK；旧宿主用 export default

export default {
    init(ext) { this.ext = typeof ext === "string" ? JSON.parse(ext || "{}") : (ext || {}); },
    home(filter) { return { class: [{type_id: "1", type_name: "电影"}], filters: {} }; },
    homeVod() { return { list: [{vod_id: "abc", vod_name: "片名", vod_pic: ""}] }; },
    category(tid, pg, filter, extend) { return page([], pg, 20); },   // http.js 注入的全局函数
    detail(id) {
        return { list: [{vod_id: id, vod_name: "片名",
                         vod_play_from: "线路1$$$线路2",
                         vod_play_url: "第1集$https://a/1.m3u8#第2集$https://a/2.m3u8$$$第1集$https://b/1.m3u8"}] };
    },
    search(wd, quick, pg) { return page([], pg, 20); },
    play(flag, id, flags) { return {parse: 0, url: id, header: {"User-Agent": "okhttp/4.0"}}; },
    proxy(params) { return [200, "text/plain", "ok"]; },
    sniffer() { return false; },
    isVideo(url) { return /\.(m3u8|mp4)(\?|$)/.test(url); },
    destroy() { }
};
```

### 7.12 drpy2 规则文件骨架

```js
var rule = {
    title: '站名',
    host: 'https://example.com',
    homeUrl: '/',
    url: '/list/fyclass/fypage.html',
    detailUrl: '/detail/fyid.html',
    searchUrl: '/search/**----------fypage---.html',
    searchable: 2, quickSearch: 0, filterable: 0,
    headers: {'User-Agent': 'MOBILE_UA'},
    timeout: 5000,
    play_parse: true,
    lazy: '',
    limit: 20,
    推荐: '.list .item;a&&title;img&&data-src;.note&&Text;a&&href',
    一级: '.list .item;a&&title;img&&data-src;.note&&Text;a&&href',
    二级: {
        "title": "h1&&Text",
        "img": ".pic&&data-src",
        "desc": ".note&&Text;.year&&Text;.area&&Text;.actor&&Text;.director&&Text",
        "content": ".intro&&Text",
        "tabs": ".tabs&&li",
        "lists": ".playlist:eq(#id) a"
    },
    搜索: '.list .item;a&&title;img&&data-src;.note&&Text;a&&href'
};
```

配置：`{"key":"drpy_站名","type":3,"api":"./lib/drpy2.min.js","ext":"./lib/我的规则.js"}`。

### 7.13 TVBox 原生 Python 框架（pyramid，`TVBoxOS-M3` 实测）

> 这是与 [7.1](#71-执行环境) 的 FongMi CatVodSpider Python **不同的另一套契约**，社区常称
> `pyramid` / `py` / `?do=py`。大量现成 Python 源（`../plugin/*.py`）是按它写的，
> 第三方客户端要兼容这批存量源，必须实现本小节。

#### 7.13.1 目录与加载约定

| 路径 | 作用 |
| --- | --- |
| `pyramid/src/python/base/spider.py` | `Spider` 抽象基类（宿主契约） |
| `pyramid/src/python/base/htmlParser.py` | `jsoup` 规则串解析（`pdfh/pd/...`） |
| `pyramid/src/python/base/localProxy.py` | `Proxy.getUrl/getPort` |
| `pyramid/src/python/app.py` | 宿主侧分发器（Java 反射调用的入口） |
| `pyramid/src/python/runner.py` | `Runner` 适配壳（把 `Spider` 包一层） |
| `pyramid/src/python/trigger.py` | `Trigger` 静态方法壳 + HTTPS→Java 兜底 |
| `pyramid/src/python/crypto_protocol_dh.py` | PyCryptodome `Crypto.Protocol.DH` 兼容垫片（供加密封装源用） |
| `../plugin/<name>.py` | **爬虫落盘目录**（相对 Python 进程 cwd） |

- 站点写法：`{"key":"py_站名","type":3,"api":"csp_Py"}`，或 `api` 指向 Python 文件的路径。
- 每个 `.py` 模块必须暴露一个名为 `Spider` 的类，宿主 `SourceFileLoader(name, path).load_module().Spider()`。
- `Spider` 是**单例**：`__new__` 缓存 `cls._instance`，重复实例化返回同一对象。
  因此不要在 `__init__` 里做每次站点切换都要重来的事（见 `setExtendInfo`）。

#### 7.13.2 入口方法（Java ↔ Python 签名对照）

| Java 调用 | Python 签名 | 备注 |
| --- | --- | --- |
| `init(context, extend)` | `init(extend="")` | 无 `context` 参数 |
| `homeContent(filter)` | `homeContent(filter)` | |
| `homeVideoContent()` | `homeVideoContent()` | |
| `categoryContent(tid,pg,filter,extend)` | `categoryContent(tid,pg,filter,extend)` | 宿主把 `extend` 字符串 `json.loads` 后传入 |
| `detailContent(ids)` | `detailContent(ids)` | 宿主 `json.loads(ids)` 后传入 |
| `searchContent(key,quick)` | `searchContent(key, quick, pg="1")` | **宿主只传 2 个参数**，`pg` 永远用默认 `"1"` |
| `playerContent(flag,id,vipFlags)` | `playerContent(flag,id,vipFlags)` | 宿主 `json.loads(vipFlags)` |
| `liveContent(url)` | `liveContent(url)` | 返回值**原样字符串透传**，不 `json.dumps` |
| `localProxy(param)` | `localProxy(param)` | 注意叫 `localProxy` 不是 `proxy` |
| `isVideoFormat(url)` / `manualVideoCheck()` | 同名 | 布尔 |
| `destroy()` | `destroy()` | |
| — | `getDependence()` → `list[str]` | 依赖的其它插件名，**默认 `[]`** |
| — | `setExtendInfo(extend)` | 默认 `self.extend = extend` |
| — | `getName()` | 站点显示名 |

- `Runner`/`Trigger` 壳**不暴露 `action`**：pyramid 源的交互对话框能力缺失，宿主需容错
  （调用不到就当作无 `action`）。
- `homeContent/categoryContent/detailContent/playerContent/searchContent` 的返回值一律
  `json.dumps(result, ensure_ascii=False)` 后交回 Java，即 **Python 侧返回 `dict`/`list`，
  不是 JSON 字符串**。这与 FongMi 的 Java 蜘蛛（返回字符串）相反。

#### 7.13.3 依赖注入（`getDependence` → `init` 的双态签名）

```python
# app.py: init(ru, extend)
spoList = []
for key in getDependenceList(ru):          # 逐个取 getDependence() 里的名字
    sp = spList.get(key) or loadFromDisk(sPath[key])   # 已加载则复用，否则 ../plugin/<key>.py
    if sp:
        setExtendInfo(sp, sParam[key])     # 用该插件自己的 SpiderParam 覆盖 extend
        spoList.append(sp)
setExtendInfo(ru, extend)                  # 最后才设置自己的 extend
ru.init(spoList if spoList else extend)    # ★ 有依赖传实例列表，无依赖传原 ext 字符串
```

**第三方实现要点**：`init` 的入参是**多态**的——有依赖时是 `Spider` 实例列表，无依赖时是
原始 `ext` 字符串。源里常见的写法是：

```python
def init(self, extend=""):
    if isinstance(extend, list):     # 拿到了依赖实例
        self.deps = extend
    else:                            # 普通字符串 ext
        self.extend = extend
```

`sParam` 的来源：`downloadPlugin` 从 URL 的 query 里取 `extend` 参数作为该插件的
`SpiderParam`；`registerPluginAlias(alias, fileName)` 可给插件起别名（别名继承原名 param）。

#### 7.13.4 基类工具方法（照抄即可）

```python
regStr(src, reg=None, group=1)   # re.search(reg, src)，失败则反序 search(src, reg)，取 group
removeHtmlTags(src)              # re.sub(r'<.*?>', '', src)
cleanText(src)                   # 去掉 U+1F300–U+1FAFF 全部 emoji 区段
fetch(url, headers, cookies, params, timeout=15, verify=True, stream=False, allow_redirects=True)
                                 # requests.get，并强制 rsp.encoding = 'utf-8'
post(url, data, headers, cookies, params, json, ...)   # requests.post，强制 utf-8
postJson(url, json, headers, cookies)                  # 仅 requests.post(url, json=...)
html(content)                   # lxml.etree.HTML(content)
xpText(root, expr)              # root.xpath(expr)，取第 0 个，无则 ''
str2json / json2str             # json.loads / json.dumps(..., ensure_ascii=False)
log(msg)                        # dict/list 走 json.dumps，其余 print
```

> ⚠️ `fetch`/`post` **无条件 `rsp.encoding = 'utf-8'`**：遇到声明 GBK 的站点会乱码，
> 源里通常再用 `rsp.content.decode('gbk')` 自救。第三方实现应改为「响应头 charset 优先，
> 无则 utf-8」，否则中文站点大面积乱码——这是已知坑（见 [11.4](#114-已知坑与不兼容点)）。
> `post` 还会把头值以 `<!DOCTYPE html>` 开头的替换成字面量 `DefaultValue`（防脏头）。

#### 7.13.5 规则串解析（`jsoup`，`htmlParser.py`）

pyramid 源用与 drpy2 同源的规则串，但**有自己的解析器常量**，与 §4.5.3「规则串语法」有差异：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `NOADD_INDEX` | `':eq\|:lt\|:gt\|:first\|:last\|^body$\|^#'` | 命中这些的选择器**不自动补 `:eq(0)`** |
| `URLJOIN_ATTR` | `'(url\|src\|href\|-original\|-src\|-play\|-url)$'` | 这些属性值自动补域名前缀（**不含 `style`**） |

- `parseHikerToJq`：海螺（Hiker）规则串转 jq 规则串，**自动补 `:eq(0)`**（除非命中 `NOADD_INDEX`）。
- 选择器可链式：`'div a && Text'`，空格分隔多级。
- `--` 前缀表示**排除**该元素及其子树。
- 提供 `pdfh/pdfa/pd/pdfl`（单值/多值）与 `pjfh/pj/pjfa`（JSON 版，`@` 前缀取 JSON 路径）。
- 解析结果带 `PARSE_CACHE` 缓存。

#### 7.13.6 宿主 HTTP 接口（爬虫回调宿主）

| 接口 | 用途 |
| --- | --- |
| `Proxy.getUrl(local)` | 返回本地代理根地址（去掉 `/proxy` 后缀） |
| `getProxyUrl(local=True)` | `f'{Proxy.getUrl(local)}?do=py'` —— **py 源的统一代理入口** |
| `GET /cache?do=get&key=` | 取缓存；值是 JSON 对象且含 `expiresAt` 时做 TTL 检查，过期自动 `del` |
| `POST /cache?do=set&key=` | 写缓存，`data={"value": …}`；`int/float` 转字符串，`dict/list` 序列化 |
| `GET /cache?do=del&key=` | 删除 |

返回值：`do=get` 时，`{...}`/`[...]` 形态自动 `json.loads`；否则原文。
`do=set|del` 返回 `'succeed'`/`'failed'`（按 HTTP 200 判定）。**缓存是 HTTP 接口而非内存**，
跨进程、跨源共享，第三方实现可用同一端口实现（见 [8.2](#82-本地-http-服务代理与远程管理)）。

> ⚠️ **`/cache` 路由不是所有分支都有**。M3 有；**DV 版的 `RemoteServer` 完全没有 `/cache`**
> （其 GET 路由只有静态页、`/proxy`、`/file/`、`/dns-query`、`/push/`、`/proxyM3u8`、`/dash/`；
> POST 只有 `/action`、`/upload`、`/newFolder`、`/delFolder`、`/delFile`）。
> 在 DV 版上跑依赖 `/cache` 的 py 源，`fetch` 会拿到一段 HTML 而非缓存值，
> `getCache` 于是把那段 HTML 当字符串返回（`len(value)>0` 分支）。
> **第三方实现必须自带 `/cache`，并让「非 JSON 值」返回空而非 HTML。**

#### 7.13.7 ⚠️ HTTPS → Java HTTP 兜底（实战价值最高的一段）

`trigger.py`  monkey-patch 了 `requests.sessions.Session.request`：

```python
_JAVA_FALLBACK_STATUS = (403, 429, 495, 496, 497, 525, 526, 527)

def _tvbox_session_request(self, method, url, **kwargs):
    if _PythonHttp is None or not url.lower().startswith("https://") or kwargs.get("stream"):
        return _session_request(self, method, url, **kwargs)   # 只对 https 非流式请求生效
    try:
        response = _session_request(self, method, url, **kwargs)
        if response.status_code not in _JAVA_FALLBACK_STATUS:
            return response
    except requests.RequestException:
        response = None
    fallback = _java_request(self, method, url, kwargs)         # 走 App 的 OkHttp
    return fallback if response is None or fallback.status_code < response.status_code else response
```

- 触发条件：**仅 `https://` 且非 `stream`**，且首次 `requests` 结果状态码落入
  `403/429/495/496/497/525/526/527`（或被拦截抛异常）。
- 兜底路径 `com.undcover.freedom.pyramid.PythonHttp.request(method, url, headersJson, body, allowRedirects)`，
  即改用宿主 App 的 **OkHttp**（TLS 指纹/ALPN 与 Chrome 一致）。
- 兜底实现细节：`params` 手工 `urlencode(doseq=True)` 拼到 URL；
  **删掉 `Accept-Encoding`**（交给 OkHttp 的透明 gzip）；
  `json=` 序列化并补 `Content-Type: application/json`；`Set-Cookie` 手工回填 session。
- 最终取「状态码更小」的那个响应（即谁更成功用谁）。

> **这条对第三方实现是硬要求**：Python 的 `requests` 用 OpenSSL 默认 TLS 栈，
> JA3 指纹与浏览器差异明显，被 Cloudflare / 自建 WAF 判定为脚本时固定返 403。
> 复刻行为：在 Python 引擎外再包一层原生 HTTP 客户端作为 fallback，是 TVBox 生态
> 能长期可用的关键工程手段（与本文 [8.6](#86-请求头与-cookie) 的 UA/Host 伪装互补）。

#### 7.13.8 插件下载与 `file://` 直载

```python
def downloadPlugin(basePath, url):
    createFile(basePath)
    name = url.split('/')[-1].split('.')[0]
    pyName = url.replace('file://','') if url.startswith('file://') else basePath + name + '.py'
    if not url.startswith('file://'):
        downloadFile(pyName, url)          # 手动跟随 Location（allow_redirects=False 循环）
    gParam['SpiderPath'][name] = pyName
    gParam['SpiderParam'][name] = parse.parse_qs(urlparse(url).query).get('extend', [''])[0]
```

- 支持 `file:///abs/path.py` 直载本地文件（不下载）。
- 下载用**手工重定向循环**（`allow_redirects=False` + 递归 `Location`），超时 20s。
- URL query 的 `extend=` 成为该插件的 `SpiderParam`，即「一个插件地址自带配置」。

##### 7.13.8.1 插件落盘目录按分支而变（且要权限）

| 分支 | 目录 | 权限要求 |
| --- | --- | --- |
| M3 | `<App cacheDir>/py` | 无（应用私有目录） |
| **DV 版** | **`/storage/emulated/0/plugin/`**（`PythonLoader.java:107` **硬编码**） | **必须 `WRITE_EXTERNAL_STORAGE`**，未授权直接返回 `SpiderNull` |

DV 版的 `pyLoader.getSpider` 第一步就是权限检查：

```java
if (ContextCompat.checkSelfPermission(App.getInstance(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED) {
    Log.i("PyLoader", "无存储权限，终止执行");
    return new SpiderNull();
}
```

**DV 版的 ext 拼接不经 URL 编码**（`pyLoader.getPyUrl`，`URLEncoder.encode` 那行被注释）：

```java
StringBuilder urlBuilder = new StringBuilder(api);
if (!ext.isEmpty()) {
//  ext = URLEncoder.encode(ext, "utf8");     // ← 注释掉
    urlBuilder.append(api.contains("?") ? "&" : "?").append("extend=").append(ext);
}
```

所以 ext 里含 `&`、`#`、空格会破坏 query——**py 源的 ext 必须是 URL 安全的**。
第三方实现应改为编码，但要知道存量源可能已按「不编码」的假设写了值。

**Python 运行时与依赖**（DV 版 `pyramid/build.gradle`）：

| 项 | 值 |
| --- | --- |
| Chaquopy | `com.chaquo.python` **12.0.1** |
| 构建用 Python | **3.12**（`buildPython(".../Python312/python.exe")`） |
| pip 依赖 | `lxml`、`ujson`、`pyquery`、`requests`、`jsonpath`、`cachetools`、`pycryptodome`、`beautifulsoup4` |
| Python 源码目录 | `pyramid/src/python`（`python.srcDirs`） |

> `ujson`/`jsonpath`/`cachetools`/`pycryptodome` 的出现说明部分存量 py 源直接
> `import ujson` / `jsonpath` / `Crypto`——第三方实现若不预装这些包，源会 `ImportError`。
> 特别是 `crypto_protocol_dh.py` 就是为 `pycryptodome` 的 `Crypto.Protocol.DH` 做的垫片。

> ⚠️ **`runner.py` 与 `trigger.py` 在 DV 版是死代码**：全仓无任何 Java 引用
> （DV 版的 `trigger.py` 甚至没有 monkey-patch 段）。§7.13.7 的 HTTPS 兜底是
> **M3 特有**；DV 版跑 py 源时没有这层保护，`requests` 被 WAF 判 403 就是真 403。

#### 7.13.9 Chaquopy 桥接层（`PythonLoader` / `PythonSpider`，源码级）

M3 用 **Chaquopy** 把 `pyramid/` 跑起来，桥接类是
`com.undcover.freedom.pyramid.PythonLoader` / `PythonSpider`。这是第三方实现
「Android App 内嵌 CPython」最完整可抄的一份。

##### 7.13.9.1 启动序列

```java
if (!Python.isStarted()) { Python.start(new AndroidPlatform(app)); }
pyInstance = Python.getInstance();
pyApp     = pyInstance.getModule("app");          // ★ 就是 pyramid/src/python/app.py
File pyCache = new File(app.getCacheDir(), "py"); // 插件落盘目录
setPluginConfig(pyCache.getAbsolutePath());
```

- `Python.start(AndroidPlatform)` 只需一次；`getModule("app")` 拿到 `app.py` 的模块对象，
  之后所有调用都是 `app.callAttr("<函数名>, ...)`。
- 插件缓存目录 = `<App cacheDir>/py`。

##### 7.13.9.2 `setConfig` 与站点解析

```java
JSONObject configJo = new JSONObject(config);
JSONArray siteList = configJo.getJSONArray("sites");
for (each site) siteMap.put(site.optString("api"), site);   // key = api 字段
```

`getUrlByApi(api)`：在 `siteMap` 里按 `api` 查到 `{key, ext}`；
若 `key` 与 `ext` 都非空且该 `key` 尚未加载，返回 `ext`（即**插件地址**），否则返回 `""`。
所以 `sites[].ext` 对 py 源而言就是「Python 插件下载地址」。

##### 7.13.9.3 `init` 的完整六步（`PythonSpider.init(context, url, ext)`）

```java
① PyObject retValue = app.callAttr("downloadPlugin", cachePath, url);   // 下载到 <cache>/py
② path = retValue.toString();
③ pySpider = app.callAttr("loadFromDisk", path);                        // SourceFileLoader + .Spider()
④ List<PyObject> poList = app.callAttr("getDependence", pySpider).asList();
   for (depUrl : poList) {
       tmpPath = app.callAttr("downloadPlugin", cachePath, depUrl.toString());
       app.callAttr("registerPluginAlias", api, tmpPath);                // 用 api 名注册别名
   }
⑤ app.callAttr("init", pySpider, extInfo);                              // extInfo = ext 字符串
⑥ isLoadSuccess() 为 false → 返回 SpiderNull
```

- **`init` 跑在单线程 `ExecutorService` 上，超时 30s**：
  `future.get(30, TimeUnit.SECONDS)`；超时**不中断任务**，直接返回 `SpiderNull`
  （`TimeoutException` 分支只打日志）。
- 成功后按 `key` 缓存 `PythonSpider`；`clear()` 会逐个 `destroy()`。
- `setApplication(app)` 必须先调用，否则 `getSpider` 抛 `Exception("set application first")`。

##### 7.13.9.4 Java ↔ Python 调用映射（`app.callAttr` 逐条对应）

| Java 方法 | Python 调用 | 参数转换 |
| --- | --- | --- |
| `init(ctx, url, ext)` | `downloadPlugin` → `loadFromDisk` → `getDependence` → `init` | 见上 |
| `homeContent(filter)` | `app.homeContent(pySpider, filter)` | 布尔直传 |
| `homeVideoContent()` | `app.homeVideoContent(pySpider)` | — |
| `categoryContent(tid,pg,filter,extend)` | `app.categoryContent(pySpider, tid, pg, filter, map2json(extend).toString())` | `HashMap` → JSON 字符串 |
| `detailContent(ids)` | `app.detailContent(pySpider, list2json(ids).toString())` | `List` → JSON 字符串 |
| `searchContent(key, quick)` | `app.searchContent(pySpider, key, quick)` | **只两参** |
| `playerContent(flag,id,vipFlags)` | `app.playerContent(pySpider, flag, id, list2json(vipFlags).toString())` | 结果过 `replaceLocalUrl` |
| `liveContent(url)` | `app.liveContent(pySpider, url)` | 原样返回 |
| `proxyLocal(params)` | `app.localProxy(pySpider, map2json(params).toString())` | 见下 |
| `destroy()` | `app.destroy(pySpider)` | — |
| `getName()` | `app.getName(pySpider)` | — |
| `isVideoFormat(url)` / `manualVideoCheck()` | — | **硬编码 `return false`** |

> ⚠️ **两个硬编码 `false` 是功能缺口**：Python 蜘蛛**无法**否决内置嗅探规则
> （`manualVideoCheck()` 恒 false → 宿主不会把判断完全交给爬虫）。
> 第三方实现应把它做成可配置/可转发。

##### 7.13.9.5 `localProxy` 的 5 元返回值契约

```java
List<PyObject> list = proxyResult.asList();
boolean base64 = list.size() > 4 && list.get(4).toInt() == 1;   // 第 5 位标记 body 是否 base64
result[0] = list.get(0).toInt();        // HTTP status
result[1] = list.get(1).toString();     // MIME
result[2] = getStream(list.get(2), base64);   // body：base64 → Base64.decode，否则 getBytes()
result[3] = headers 可用 ? getHeader(list.get(3)) : null;        // 可选 headers（PyObject.asMap()）
```

即 Python 侧 `localProxy` 返回 `[status, mime, body, headers?, base64Flag?]`，
`headers` 与 `base64Flag` 都可省略。这比 §4.4.4 / §7.7 描述的 `[status, mime, body, headers]`
多一个可选的**第 5 位 base64 标记**——二进制正文（图片、字幕）靠它传输。

##### 7.13.9.6 ⚠️ `http://127.0.0.1:UndCover/proxy` 是占位符

```java
public String replaceLocalUrl(String content) {
    return content.replace("http://127.0.0.1:UndCover/proxy",
                           PythonLoader.getInstance().localProxyUrl());
}
```

Python 源在 `playerContent` 里可以返回字面量
**`http://127.0.0.1:UndCover/proxy`**，宿主会在返回前把它替换成真实的
`Proxy.getUrl(true)`（`http://127.0.0.1:<port>/proxy`）。
第三方实现必须实现这个占位符替换，否则存量 py 源返回的播放地址无法使用。

##### 7.13.9.7 构建风味：同一份代码「带 / 不带 Python」

M3 用 **productFlavors** 切成两族，`src/` 下对应两个 source set：

| 风味族 | `java` / `java32` / `java64` | `python` / `python32` / `python64` |
| --- | --- | --- |
| source set | `src/main` + **`src/normal`** | `src/main` + **`src/python`** |
| ABI | java/java32=armeabi-v7a(+arm64) / java64=arm64-v8a | 同上切分 |
| `pyLoader` 实现 | `src/normal/.../pyLoader.java`：**全部方法只打日志** `"Python is not supported."`，`getSpider` 返回 `SpiderNull` | `src/python/...` 下的 `PythonLoader`/`PythonSpider`/`PythonHttp`/`PyToast`/`PyLog` |
| 额外混淆规则 | 无 | `proguard-python.pro` |
| APK 体积 | 小（无 CPython） | 大（含 `libpython*.so`） |

**这个模式值得直接抄**：把 `IPyLoader` 做成接口，`main` 只依赖接口；
「不要 Python」的风味用一个打日志的空实现替换，从而**同一份业务代码**能出两种包。
`IPyLoader` 的方法集（第三方实现的最小接口）：

```java
public interface IPyLoader {
    void clear();
    void setConfig(String jsonStr);                          // 传入整份配置 JSON
    void setRecentPyKey(String key);                         // 切换当前 py 源
    Spider getSpider(String key, String cls, String ext);    // cls = api, ext = 插件地址
    Object[] proxyInvoke(Map<String,String> params);
    Object[] proxyInvoke(Map<String,String> params, String key);
}
```

> 注意 `IPyLoader` 在 M3 与 DV 版之间**有差异**：DV 版只有
> `void setRecentPyKey(String pyApi);`，**没有** `proxyInvoke(params, key)` 重载。
> 第三方实现应以宽松方式调用（反射探测或 try/catch）。

---

## 8. 网络层与基础设施

### 8.1 DNS over HTTPS（doh）

```jsonc
"doh": [
  {"name":"Google","url":"https://dns.google/dns-query","ips":["8.8.4.4","8.8.8.8"]},
  {"name":"Cloudflare","url":"https://cloudflare-dns.com/dns-query",
   "ips":["1.1.1.1","1.0.0.1","2606:4700:4700::1111"]}
]
```

- `url`：DoH 端点（RFC 8484，`application/dns-message`）。
- `ips`：**只为解析 DoH 服务器自身域名做 bootstrap**，不是给业务域名用的。
- ⚠️ **原版实现缺口**：配置里的 `doh` 数组会被解析并合并进候选列表（`VodConfig.getDoh()`），
  但实际 DNS 走的是**用户设置**（`OkGoHelper.updateDns`），配置的 `doh` 并未接到 OkDns。
  详见 §3.6。
- 客户端内置一个本地 DoH 服务器：`GET /dns-query?name=<domain>` 返回 `application/dns-message` 二进制。
- **播放器级 DoH**：IJK 播放器通过 `IjkMediaPlayer.setDotPort(enabled, port)` 把域名解析委托给本地 HTTP 服务的
  `/dns-query` 端点——这是「播放器也能抗 DNS 污染」的关键机制。

### 8.2 本地 HTTP 服务（代理与远程管理）

默认端口 **9978**，engine 版被占用递增至 **9998**，classic 版至 **9999**。
全部路由支持 **Range/ETag**。

| 路由 | 用途 |
| --- | --- |
| `/proxy` | 爬虫本地代理（`do=js`/`do=node`/`do=py`/`do=live`/`do=ck`） |
| `/action` | 爬虫 action 调用 |
| `/cache` | 缓存访问 |
| `/image` | 图片代理 |
| `/file/<path>` | 浏览外部存储文件 |
| `/media` | 媒体文件 |
| `/parse` | 解析调用 |
| `/tvbus` | TV 总线 |
| `/device` | 设备信息 |
| `/dns-query?name=` | DoH 转发 |
| `/upload`（POST） | 上传文件（multipart，`files-` 前缀字段） |
| `/newFolder`、`/delFolder`、`/delFile`（POST） | 文件管理 |
| `/assets/*` | APK assets 静态文件 |

**`/proxy` 的分发顺序**：`siteKey` → `do=js|node|py` → JAR 内静态 `Proxy.proxy(Map)`（失败再试其它 jar）。

**scheme 转换**（`engine/utils/UrlUtil.java:59-68`）：
`assets://x` → `http://127.0.0.1:<port>/x`；
`proxy://?…` → `http://127.0.0.1:<port>/proxy?…`；
`file:///sdcard/a` → `http://127.0.0.1:<port>/file/sdcard/a`。

**远程管理/投屏**：客户端在设置里展示一个二维码（`http://<局域网IP>:9978/`），
手机浏览器打开后可：推送配置地址（`RefreshEvent.TYPE_API_URL_CHANGE`）、
推送直播源（`TYPE_PUSH_URL`）、发送搜索文本（`SearchReceiver` 广播）、浏览/上传/删除文件。

**请求头三级覆盖**：站点头 → 解析器头 → 播放头，缺 UA 时补设置值或 WebView UA；
Cookie 从 WebView/CookieManager 合并。**没有全局 UA 注入。**

#### 8.2.1 路由集合按分支而变（DV 版缺 4 个）

上表是 M3/engine 的全集。**DV 版的 `RemoteServer` 只有下列路由**：

| 方法 | DV 版路由 |
| --- | --- |
| GET | 静态页、`/proxy`（`do`/`go`）、`/file/`、`/dns-query`、`/push/`、`/proxyM3u8`、`/dash/` |
| POST | `/action`、`/upload`、`/newFolder`、`/delFolder`、`/delFile` |

**DV 版没有**：`/cache`、`/parse`、`/image`、`/media`、`/tvbus`、`/device`。

- DV 版的 `/action` 也缩水成 3 个 `do`：`search`、`api`、`push`（**无 `liveApi`/`danmuApi`**）。
- DV 版端口从 9978 起，`while (serverPort < 9999)` 自增（与 classic 一致，非 9998）。
- 遥控协议：`POST http://<ip>:9978/action`，表单 `do=push&url=<url>|Header=value&...`
  —— **push 的 URL 后面用 `|` 接头信息**，与播放行的 `URL|k=v` 同一约定。
- 设备发现：对 `/24` 网段约 30 个 IP 发**空 body** 的 `POST /action`，期待返回 `"ok"`。

> 第三方实现若目标是「兼容所有分支的配置」，路由要按上表全集实现；
> 但要知道 DV 版用户扫出来的管理页功能更少。

### 8.3 `hosts`（DNS 覆盖表）

```jsonc
"hosts": ["img1.wsyzy.org=1.2.3.4", "fiizvfck.top=fan.cloudflare.182682.xyz"]
```

`域名=IP`（或 `域名=目标域名`），由 `OkDns.addAll` 直接拆 `=` 入表，在 DNS 解析前替换。
查找：精确命中优先，其次「包含或正则」，找不到返回原 hostname。
**它不是 hosts 文件，是 DNS 覆盖表**（用于图片 CDN 加速/防劫持）。

### 8.4 `ads`（广告拦截）

```jsonc
"ads": ["static-mozai.4gtv.tv", "s3t3d2y8.afcdn.net"]
```

交给 `AdBlocker.addAdHost()`，在 WebView 与网络层拦截。元素是**域名或域名片段**（不是正则），
匹配 `url.toLowerCase().contains(adHost)`，命中后返回空 `WebResourceResponse`
（`text/plain`，空 body）。内置默认 57 条，仅当列表为空时注入。

### 8.5 `rules`（嗅探正则与点击脚本）

见 §3.6——两代结构（`{host,rule[],filter[]}` 与 `{name,hosts[],regex[],exclude[],script[]}`）并存，实现必须都容错。

```jsonc
"rules": [
  {"host":"api.52wyb.com","rule":["m3u8?pt=m3u8"]},
  {"host":"www.maolvys.com","rule":["document.getElementsByClassName('swal-button')[0].click()"]}
]
```

`host` 支持通配；`rule` 数组既可以是**嗅探正则**（命中即认为找到直链），
也可以是**注入 WebView 的 JS**（自动点击/跳过广告页）。

### 8.6 请求头与 Cookie

- `rule.headers` 的 `User-Agent` 支持宏：`MOBILE_UA`/`PC_UA`/`UC_UA`/`IOS_UA`/`UA`（init 时展开）。
- `Cookie` 可写成一个 URL，客户端自动拉取该 URL 内容作为 Cookie。
- `rule.encoding != "utf-8"` 时自动加 `Content-Type: text/html; charset=<encoding>`（GBK 等）。
- WebView Cookie 通过 `net.getCookie(url)`/`net.setCookie(url, cookie)` 读写；
  请求加 `cookie:true` 才自动带入与更新。
- 图片来源防盗链：`rule.图片来源 = "@Referer=xxx@User-Agent=yyy"`，拼在图片 URL 后。

### 8.7 其它基础设施

- **SSL/TLS 兼容**：旧服务器（TLS 1.0、弱套件）需要 `SSLSocketFactoryCompat`。
- **IPv6**：README 常提「需开启 IPv6」，实现时应同时尝试 AAAA 记录。
- **超时**：站点级 `timeout`（秒）、爬虫级 `timeout`（毫秒）、播放级 `timeout`（直播连接超时）。
- **缓存**：配置缓存、 spider jar 缓存（`<cache>/jar/<md5>.jar`）、图片缓存、TTS 缓存、Local 存储。

### 8.8 本地服务端口分配与远程管理（源码级）

`ControlManager.startServer()`（`app/.../server/ControlManager.java`）的完整流程：

```java
do {
    mServer = new RemoteServer(RemoteServer.serverPort, mContext);
    mServer.setDataReceiver(receiver);
    try {
        mServer.start();
        com.github.catvod.Proxy.set(RemoteServer.serverPort);                    // ① 通知爬虫侧端口
        IjkMediaPlayer.setDotPort(Hawk.get(HawkConfig.DOH_URL, 0) > 0,
                                  RemoteServer.serverPort);                      // ② DoH 端口灌进 ijk
        break;
    } catch (IOException ex) {
        RemoteServer.serverPort++;                                                // ③ 占用则 +1 重试
        mServer.stop();
    }
} while (RemoteServer.serverPort < 9999);                                         // ④ 上限 9999
```

- `getAddress(local)`：`local=true` → `mServer.getLoadAddress()`（127.0.0.1），
  `false` → `mServer.getServerAddress()`（局域网 IP）。服务未起时返回 `""`——
  这就是 `SpiderApi.getPort()` 可能返回空串的根源。
- **每次都要做 `isStarting()` 检查**，未启动则 `startServer()`（懒启动）。

**`DataReceiver` 远程管理契约**（推送/遥控入口，第三方实现做「手机推配置」时需要）：

| 回调 | 行为 |
| --- | --- |
| `onTextReceived(text)` | 发广播 `SearchReceiver.action`，`extras["title"]=text`（**远程搜索**） |
| `onApiReceived(url)` | `EventBus` post `RefreshEvent(TYPE_API_URL_CHANGE, url)`（换配置地址） |
| `onLiveApiReceived(url)` | 写 `Hawk(LIVE_API_URL)` + `HistoryHelper.setLiveApiHistory`，post `TYPE_LIVE_API_URL_CHANGE` |
| `onDanmuApiReceived(url)` | 写 `Hawk(DANMU_API)`，post `TYPE_SET_DANMU_SETTINGS` |
| `onPushReceived(url)` | `PushReceiver.send(context, url)`（推送到播放器） |

> `IjkMediaPlayer.setDotPort(dohEnabled, port)` 是把本地 `/dns-query` 代理端口注入
> 播放器内核，让 ijk 的域名解析也走 DoH——这是 `doh` 配置唯一真正生效的路径。
> 第三方实现若用 ExoPlayer/Media3，需自建等效的 DNS 注入（见 §8.1）。

### 8.9 本地数据库 schema（DV 版 Room，可直接复刻）

DV 版用 **Room**，库名 `tvbox.v3.db`（`DB_NAME + ".v" + DB_FILE_VERSION + ".db"`，
`DB_FILE_VERSION = 3`，`AppDataManager.java:27,112`），**三张表**：

| 表 | 字段 | 用途 |
| --- | --- | --- |
| `cache` | `key` TEXT **PK**（不自增）、`data` BLOB | 通用 KV：**播放进度、字幕缓存、py 源缓存** |
| `vodRecord` | `id` INTEGER PK 自增、`vodId`、`updateTime`、`sourceKey`、`data` BLOB、`dataJson` TEXT | 观看历史 |
| `vodCollect` | `id` INTEGER PK 自增、`vodId`、`updateTime`、`sourceKey`、`name`、`pic` | 收藏 |

**播放进度不写 `vodRecord`，而写 `cache` 表**：

```java
CacheManager.save(MD5.string2MD5(progressKey), position);   // position = Long 毫秒
CacheManager.delete(MD5.string2MD5(preProgressKey), 0);     // 换集先删旧键
```

- 进度键 `progressKey` 是 `<sourceKey>|<vodId>|<flag>|<index>` 形式的字符串，
  **存的时候取 `md5(progressKey)` 作为 `cache.key`**。所以同一个影片在不同源/不同线路/不同集
  各有独立进度。
- 历史按 `(sourceKey, vodId)` **upsert**；Gson 序列化 `VodInfo` 时
  **排除 `seriesFlags` / `seriesMap`**（这两字段体积大且可由播放源重建）。
- `addMigrations` **全部被注释**——升级不迁移，`DB_FILE_VERSION` 一变就是新库。
  （`MIGRATION_4_5` 甚至引用了实体里不存在的 `localSource`，说明代码来自别的分支。）
- 第三方实现若要兼容「从旧 TVBox 导入数据」，直接读这三张表即可，
  关键是 `cache` 表的 `key = md5(progressKey)` 约定。

### 8.10 内部探针头与 URL 内联头（DV 版私有协议）

DV 版在起播前会给播放请求注入一组 **`X-TVBox-Probe-*`** 头，把流探测结果告诉下游
（本地代理/爬虫可据此改行为）。这是**私有约定**，但第三方实现若要做「网盘代理」需知道：

| 头 | 值 | 含义 |
| --- | --- | --- |
| `X-TVBox-Probe-Container` | `matroska` | 容器是 Matroska（URL 或探测结果判定） |
| `X-TVBox-Probe-AudioPassthrough` | `"1"`/`"0"` | 用户是否请求音频直通 |
| `X-TVBox-Probe-AudioPassthroughAllowed` | `"1"`/`"0"` | 设备/探测是否允许 |
| `X-TVBox-Probe-CompressedAudio` | `"1"`/`"0"` | 是否存在可直通的压缩音频轨 |
| `X-TVBox-Probe-DolbyVision` | `"1"` | 流含 DV |
| `X-TVBox-Probe-Hdr10` / `-Hdr10Plus` | `"1"` | 流含 HDR10 / HDR10+ |
| `X-TVBox-Probe-NativeDvDevice` | `"1"` | 设备支持原生 DV 路由 |
| `X-TVBox-Probe-Java64LocalProxyFast` | `"1"` | java64 非 TV 设备 + 探测摘要含 `java64` |
| `X-TVBox-Probe-Tv32SafePcm` | `"1"` | 32 位电视强制安全 PCM |

（`PlayActivity.applyProbePlaybackHeaders`，`PlayActivity.java:2246-2280`。）

**URL 内联头**：播放地址可带 `@Headers=` / `@User-Agent=` 片段，客户端在请求前剥离并转成头
（图片加载器同样支持，`MyOkhttpDownLoader.java:74-75`）：

```java
if (url.contains("@Headers=")) header = url.split("@Headers=")[1].split("@")[0];
```

即 `http://host/a.m3u8@Headers=User-Agent=okhttp@Referer=https://x.com` 这类写法。
**分隔符是 `@`**，与 §6.2 直播行的 `URL|k=v&k2=v2` 是两套不同约定，别混。

---

## 9. 第三方应用实现清单

### 9.1 分层架构

```
┌─────────────────────────────────────────────────┐
│ UI 层：首页/站点/分类/详情/播放/直播/搜索/设置        │
├─────────────────────────────────────────────────┤
│ 业务层：                                          │
│   ConfigManager  配置加载/缓存/相对路径解析/订阅     │
│   SiteRegistry   站点分发（type 0/1/3/4）           │
│   SpiderHost     JAR(Dex) + QuickJS + Python      │
│   LiveManager    直播源解析/EPG/回看/台标            │
│   PlayManager    直链/解析/嗅探/内核/DRM/字幕/弹幕   │
│   LocalProxy     本地 HTTP 服务（代理/DoH/文件）      │
├─────────────────────────────────────────────────┤
│ 网络层：OkHttp + DoH + hosts + ads + UA/Referer    │
├─────────────────────────────────────────────────┤
│ 播放层：IJK / Exo / 系统 + Danmaku + Subtitle      │
└─────────────────────────────────────────────────┘
```

### 9.2 MVP 实施顺序（每步都可独立验证）

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| 1 | 配置加载（lenient JSON、相对路径、缓存、多配置切换） | 能加载两个参考仓库的 `1.json`/`2.json`/`tvbox.json` 并列出全部站点 |
| 2 | `type=1` 采集站（XML + JSON） | 6 个采集站能出分类、列表、详情、剧集 |
| 3 | txt/m3u 直播 + EPG + 台标 | 50 频道 txt 与 1403 频道 m3u 都能加载并播放 |
| 4 | 本地代理（`/proxy`、`do=live`、`do=js`） | `proxy://` 与远程直播源可用 |
| 5 | 播放内核 + 直链播放 + 进度/历史/收藏 | m3u8/mp4/flv 可播，进度可续 |
| 6 | 解析（type 0/1/2/3/4）+ WebView 嗅探 | 配置的 5 种 parses 都能跑通 |
| 7 | `type=3` JAR(Dex) 加载 + `csp_*` | 能加载 `jinenge.jar` 并调用 `csp_AList`/`csp_Panda` |
| 8 | QuickJS 引擎 + `rule` 式 JS 源 | 能跑 `南瓜配置.js` 这类 drpy2 源 |
| 9 | 弹幕/字幕/DRM/跳过片头尾/多画质 | Demo 爬虫的全部播放附加字段生效 |
| 10 | 远程管理/投屏 + 备份恢复 | 手机可推配置、推直播源 |

> 阶段 1–6 不依赖任何爬虫，即可获得「可用的第三方客户端」；7–8 决定能否吃满配置仓库。

### 9.3 关键实现细节清单（易错点）

1. **JSON 必须 lenient**：`//` 与 `#` 注释、单引号、无引号键名、尾逗号、`;` 代替 `,`。
   （两个参考仓库的配置头部都有 `//` 注释。）
2. **配置可能是密文**：按 §3.1.1 顺序逐级尝试（JSON → `**` Base64 → `2423` CBC → `;pk;` ECB）。
3. **相对路径相对配置 URL**（重定向后的最终 URL），且只对
   `spider/jar/api/ext/url/sourceUrl/playUrl/wallpaper/epg/logo` 这 10 个键递归解析；
   `header` 下的值**不**递归。`;md5;` 两段各自递归解析。
4. **`;md5;` 分割**：md5 段也可能是 URL（先 GET 再 trim）；md5 不符时**不报错**，
   只是不用缓存（本地非 http 路径会直接加载，远程会重新下载）。**注意是固定字面量 `;md5;`，不是任意分号。**
5. **jar 是 dex 不是 class**：必须用 `DexClassLoader`；加载后反射调用可选的静态
   `com.github.catvod.spider.Init.init(Context)` 与 `com.github.catvod.spider.Proxy.proxy(Map)`。
6. **`csp_X` → 类 `com.github.catvod.spider.X`**（原样拼接，大小写敏感）。
7. **字段类型混用**：`playerType` 可能是 `2` 或 `"2"`；`ext` 可能是字符串、URL、对象、密文；
   实现时必须做多态解析（对象会被序列化成字符串传给爬虫）。
8. **剧集串分隔符**：线路 `$$$`、剧集 `#`、每集 `名称$值`；名称里的 `$`/`#` 要替换。
9. **直播格式靠内容嗅探**，不是扩展名，也不是 `lives[].type`。
10. **txt 直播的 `$` 后缀不会被剥离**（参考仓库 43/50 条带 `$LR—IPV4`），
    实现时要决定是否容错。
11. **m3u 的频道名**取 `#EXTINF` 行中第一个引号外逗号后的文本；属性支持三种引号形态。
12. **`lives` 可能是裸 JSON 数组**（直播专用配置）或含 `groups`/`channels` 的对象。
13. **配置可能是「拼接坏」的**（`tvbox.json` 根对象后粘了第二份配置）——
    宽松解析器只读第一个完整值，尾部数据静默丢弃；实现时应保持一致行为并给出提示。
14. **`pyramid` 的 `init` 入参是多态的**（依赖实例列表 / 原 ext 字符串），见 §7.13.3。
15. **`pyramid` 的 `searchContent` 永远拿不到 pg**（宿主只传 key/quick），分页要靠 `extend` 自己带。
16. **Python 引擎必须包一层原生 HTTP 兜底**，否则 `requests` 的 TLS 指纹会被 WAF 判 403，
    见 §7.13.7；触发码集合 `403/429/495/496/497/525/526/527`。
17. **`SpiderApi.webParse` 的 Base64 是 `URL_SAFE | NO_WRAP`**，不能带换行，也不能用标准 Base64。
18. **`SpiderApi.multiReq` 的线程池上限是 6**，且任一项异常会让**整个**结果变 `""`——
    若你要的是「部分成功也要用」，必须自己实现而不是调它。
19. **DLNA 的播放头没有标准承载位**：TVBox 塞在 `<dc:description>` 的 JSON 里（§5.13.3），
    自定义实现可自行约定，但要与目标渲染器对齐。
20. **DLNA 的 `Seek` 失败必须忽略**：不是所有 MediaRenderer 都支持 `REL_TIME`。
21. **DV → HDR10 降级必须同时补 HDR 静态元数据**（`mastering-display`/`max-cll`/`maxfall`），
    只剥 RPU 而不补元数据，部分电视不激发 HDR（§5.8.2.5）。
22. **HDR 判断不能只看 Main10 / BT.2020**：位深与色域都不是传输函数，SDR 也可能带；
    必须要有 PQ/HLG/静态元数据等「动态范围证据」（§5.8.2.4）。
23. **`play_type` 的取值语义按分支而变**，不要当全局常量（§5.8）。
24. **本地播放代理端口可能是 6677 而不是 9978**（DV 版 `6677/proxy/play`），
    端口探测要从配置/运行态取，不要硬编码（§5.8.2.8）。
25. **EPG 频道名必须先归一化再匹配**，且非 CCTV 名返回的是**未删空格的原样 trim**（§6.5.1）——
    直接 `equals` 会把 `北京 卫视` 与 `北京卫视` 判为不同频道。
26. **XMLTV 解析必须关 XXE**：`external-general-entities`、`external-parameter-entities`、
    `load-external-dtd` 全部置 false，并设空 `EntityResolver`（§6.5.2）。
27. **简介抓取绝不用「列表第一条」顶替**：ID 不同必须返回空（§4.8.1）。
28. **WebDAV `PROPFIND` 必须带 `Depth: 1`**，且要设响应体与条目数上限（§4.9.2）。
29. **HDR 下文本字幕必须迁到应用叠加层**，否则 Android 原生渲染器显示纯白；
    但 PGS/VobSub 位图字幕必须留在设备位图路径（§5.12.1 / §5.8.2.7）。
30. **字幕 HDR 样式只能覆盖「无源样式的纯文字 cue」**，含 ASS 覆盖标签/HTML 标记/
    WebVTT cue class 的一律走源样式（§5.12.1）。

### 9.4 Golden 测试向量

**配置解析**

```jsonc
// 注释与尾逗号必须被接受
{
  "spider": "./a.jar;md5;d41d8cd98f00b204e9800998ecf8427e",   // 尾逗号
  "sites": [{"key":"k","name":"n","type":1,"api":"http://x/api.php/provide/vod/"}],}
```

**MacCMS XML 详情**：见 §4.2.2，须能从 `<dd flag="zuidam3u8">第01集$url#第02集$url</dd>`
解析出「线路 zuidam3u8 + 2 集」。

**MacCMS JSON 搜索**：`GET http://x/api.php/provide/vod/?ac=detail&wd=测试` 须返回 `list[]`。

**直播 txt**：`CCTV1,http://a/1.m3u8#http://a/2.m3u8` → 频道 CCTV1、2 个源。

**直播 m3u**：

```text
#EXTM3U x-tvg-url="https://epg/x.xml"
#EXTINF:-1 tvg-id="CCTV1" tvg-logo="http://l/1.png" group-title="央视",CCTV1综合
http://a/1.m3u8|user-agent=okhttp&referer=https://x.com
```

→ 分组「央视」、频道「CCTV1综合」、tvg-id `CCTV1`、UA `okhttp`、Referer `https://x.com`。

**规则串**：`.list .item;a&&title;img&&data-src;.note&&Text;a&&href`
→ 5 段：列表容器、标题、图片、备注、链接。

**播放返回**：

```json
{"parse":0,"url":"https://a/1.m3u8","header":{"User-Agent":"okhttp"},"subs":[{"name":"中文","url":"https://a/s.srt","format":"application/x-subrip"}],"skips":[{"type":"opening","start":60000,"end":90000}]}
```

**EPG 频道名归一化**：见 §6.5.1，`CCTV-1 综合`→`CCTV1`、`cctv-5+体育赛事`→`CCTV5+`、
`CCTV-4K超高清`→`CCTV4K`、`" 湖南卫视 "`→`湖南卫视`、`null`→`""`。

**简介身份匹配与 HTML 清理**：见 §4.8。要点：`id` 不同绝不给简介；
同名重拍返回 `null`；`<p>第一段 &amp; 第二段</p><script>bad()</script>` → `第一段 & 第二段`；
`<des><![CDATA[<p>中文简介</p>]]></des>` → `中文简介`。

**`SpiderApi.webParse`**：`webParse("https://x.com/v/1","mgtv")` →
`proxy://go=SuperParse&flag=mgtv&url=<URL_SAFE_BASE64("https://x.com/v/1")>`。

---

# 第二部分 Emby 与 Jellyfin 协议

## 10. Emby 与 Jellyfin 协议

### 10.1 关系与适用场景

- **Jellyfin 是 Emby 3.5.2 的自由分叉**，两者 API 同族：同一套 REST 端点、同一套 `MediaBrowser` 授权头格式、
  同一套 DLNA `DeviceProfile` 播放协商机制。
- 差异主要在：Jellyfin 增加 `QuickConnect`、`SyncPlay`、`Trickplay`、`/UserViews`、`Startup/*`、`Packages/*`；
  Emby 保留 `Devices/*`、`Connect/*`、`Notifications/*`、`Dlna/*`、`Channels/{id}/Items` 等私有端点。
- **为什么和 TVBox 写在一份文档里**：两者都是「配置/协议驱动的媒体聚合客户端」的对接对象。
  第三方播放器可以同时对接：TVBox 配置源（直播 + 采集站 + 爬虫）与 Emby/Jellyfin（本地媒体库）。

**一手依据**：`MediaBrowser/Emby` 服务端源码（256 条路由）、`jellyfin/jellyfin` 服务端源码、
Jellyfin OpenAPI 12.4.0（294 条 path / 357 个 schema）、`jellyfin-sdk-kotlin`（`AuthorizationHeaderBuilder`、`DefaultSocketApi`）、
`jellyfin/jellyfin-androidtv` 客户端源码。

### 10.2 服务器发现

| 步骤 | 端点 | 说明 |
| --- | --- | --- |
| 1 | `GET /System/Info/Public` | **无需认证**，返回 `PublicSystemInfo`（`ServerName`/`Version`/`Id`/`LocalAddress`/`WanAddress`/`OperatingSystem`…） |
| 2 | UDP 广播 `who is EmbyServer?` / `who is JellyfinServer?` → `Hey, EmbyServer is right here` | 局域网自动发现（端口 7359） |
| 3 | 用户输入 `http://host:8096` | 手动指定 |

### 10.3 认证协议

#### 10.3.1 授权头（权威格式）

源码：`jellyfin-sdk-kotlin/.../util/AuthorizationHeaderBuilder.kt`

```
Authorization: MediaBrowser Client="<客户端名>", Version="<版本>", DeviceId="<设备ID>", Device="<设备名>", Token="<访问令牌>"
```

规则：

- 固定 scheme `MediaBrowser`（`AUTHORIZATION_SCHEME`）。
- 参数顺序：`Client`、`Version`、`DeviceId`、`Device`、`Token`。
- **`Token` 为 null 时整项省略**（未认证请求，如 `/System/Info/Public`）。
- 值做 URL-part 编码，换行替换为空格。
- 键**不能**包含 `=` 或 `,`，不能以 `"` 开头或结尾（否则服务端 500）。

#### 10.3.2 令牌解析顺序（Emby 服务端权威）

源码：`Emby.Server.Implementations/HttpServer/Security/AuthorizationContext.cs:47-86`

| 优先级 | 来源 |
| --- | --- |
| 1 | `Authorization: MediaBrowser ... Token="..."` |
| 2 | `X-Emby-Token` 头 |
| 3 | `X-MediaBrowser-Token` 头 |
| 4 | `api_key` 查询参数 |

**第三方客户端实现建议**：始终用 `Authorization: MediaBrowser ...`；同时兼容读 `X-Emby-Token` 与 `api_key`（老服务端/老客户端混排时必需）。

#### 10.3.3 登录端点

```
POST /Users/AuthenticateByName
Content-Type: application/json

{"Username": "admin", "Pw": "password"}
```

响应（`AuthenticationResult`）：

```json
{
  "User": {"Name":"admin","Id":"<userIdGuid>","HasPassword":true,"Configuration":{...},"Policy":{...}},
  "SessionInfo": {"Id":"<sessionId>","UserId":"...","DeviceId":"...","DeviceName":"...","ClientName":"...","ApplicationVersion":"...","PlayState":{...}},
  "AccessToken": "<accessToken>",
  "ServerId": "<serverId>"
}
```

其它认证端点：

| 端点 | 说明 |
| --- | --- |
| `POST /Users/AuthenticateByName` | 用户名密码 |
| `POST /Users/AuthenticateWithQuickConnect` | Jellyfin 快速连接（6 位码） |
| `GET /QuickConnect/Enabled`、`POST /QuickConnect/Initiate`、`GET /QuickConnect/Connect`、`POST /QuickConnect/Authorize` | Jellyfin QuickConnect 流程 |
| `GET /Users/Public` | 列出可登录用户（无密码时） |
| `POST /Sessions/Logout` | 登出 |

`AccessToken` 长期有效（除非轮换），之后所有请求都带上 `Token="<AccessToken>"`。

#### 10.3.4 `DeviceProfile`（DLNA 播放能力声明）

`POST /Items/{itemId}/PlaybackInfo` 的请求体核心：

```json
{
  "DeviceProfile": {
    "Name": "MyClient",
    "MaxStreamingBitrate": 120000000,
    "MaxStaticBitrate": 120000000,
    "MusicStreamingTranscodingBitrate": 384000,
    "MaxStaticMusicBitrate": 384000,
    "DirectPlayProfiles": [
      {"Container": "mp4,mkv,webm", "AudioCodec": "mp3,aac,opus,flac", "VideoCodec": "h264,hevc,vp8,vp9,av1", "Type": "Video"}
    ],
    "TranscodingProfiles": [
      {"Container": "ts", "Type": "Video", "VideoCodec": "h264,hevc", "AudioCodec": "aac,mp3",
       "Protocol": "hls", "Context": "Streaming", "MaxAudioChannels": "6",
       "MinSegments": 1, "SegmentLength": 6, "BreakOnNonKeyFrames": true,
       "EnableSubtitlesInManifest": true, "EnableMpegtsM2TsMode": false}
    ],
    "ContainerProfiles": [
      {"Type": "Video", "Container": "mp4", "Conditions": [
        {"Condition":"Equals","Property":"IsAnamorphic","Value":"false","IsRequired":false}]}
    ],
    "CodecProfiles": [
      {"Type": "VideoAudio", "Codec": "aac", "Conditions": [
        {"Condition":"LessThanEqual","Property":"AudioChannels","Value":"6","IsRequired":false}]}
    ],
    "SubtitleProfiles": [
      {"Format": "srt", "Method": "External"},
      {"Format": "ass", "Method": "External"},
      {"Format": "vtt", "Method": "External"},
      {"Format": "pgssub", "Method": "Embed"}
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `DirectPlayProfiles[].Type` | `Video`/`Audio`/`Photo`/`VideoAudio` |
| `TranscodingProfiles[].Protocol` | `hls`/`http`/`udp`/`rtmp` |
| `TranscodingProfiles[].Context` | `Streaming`/`Static` |
| `TranscodingProfiles[].EnableMpegtsM2TsMode` | 输出 MPEG-TS |
| `TranscodingProfiles[].SegmentLength` / `MinSegments` | HLS 分片 |
| `ContainerProfiles[].Conditions` | 容器级条件（`Equals`/`NotEquals`/`LessThanEqual`/`GreaterThanEqual`） |
| `CodecProfiles[].ApplyConditions` | 应用到哪个项 |
| `SubtitleProfiles[].Method` | `External`/`Embed`/`Hls`/`Encode`/`Video` |

响应 `PlaybackInfoResponse`：

```json
{"MediaSources": [/* MediaSourceInfo */], "PlaySessionId": "<uuid>", "ErrorCode": null}
```

### 10.4 内容模型（`BaseItemDto`）

最常用的字段（Jellyfin OpenAPI `BaseItemDto`）：

| 字段 | 说明 |
| --- | --- |
| `Id` / `Name` / `OriginalTitle` / `ServerId` | 标识 |
| `Type` | `Movie`/`Series`/`Season`/`Episode`/`MusicAlbum`/`Audio`/`BoxSet`/`Playlist`/`TvChannel`/`LiveTvProgram`… |
| `Overview` / `Taglines` / `Genres` / `Studios` / `People` / `GenreItems` | 元数据 |
| `ProductionYear` / `PremiereDate` / `CommunityRating` / `CriticRating` / `OfficialRating` / `CustomRating` | 评级 |
| `RunTimeTicks` / `CumulativeRunTimeTicks` | 时长（**100ns 为一 tick**，`ticks / 10000000 = 秒`） |
| `ParentId` / `ParentIndexNumber` / `IndexNumber` / `IndexNumberEnd` | 父子与集号 |
| `Container` / `Video3DFormat` / `IsHD` / `IsFolder` / `MediaSources` / `MediaStreams` | 媒体 |
| `ImageTags` / `BackdropImageTags` / `ParentLogoItemId` / `ParentBackdropItemId` | 图片 |
| `UserData` | `{PlaybackPositionTicks, Played, PlayCount, IsFavorite, LastPlayedDate, UnplayedItemCount}` |
| `ChannelId` / `ChannelName` / `ChannelNumber` | 直播频道 |
| `ProviderIds` | `{"Imdb":"tt...","Tmdb":"...","Tvdb":"..."}` |
| `PlayAccess` / `CanDelete` / `CanDownload` | 权限 |

`MediaSourceInfo`（播放源）关键字段：

| 字段 | 说明 |
| --- | --- |
| `Id` / `Path` / `Protocol` (`Http`/`File`/`Hls`) / `Type` / `Container` / `Size` / `Name` | 基本 |
| `SupportsDirectPlay` / `SupportsDirectStream` / `SupportsTranscoding` | **三种播放能力** |
| `TranscodingUrl` / `TranscodingSubProtocol` / `TranscodingContainer` | 服务端算好的转码地址 |
| `MediaStreams` | 轨道数组（`Type`=`Video`/`Audio`/`Subtitle`，`Codec`/`Index`/`IsDefault`/`DisplayTitle`/`Width`/`Height`/`BitRate`/`Channels`/`DeliveryMethod`/`DeliveryUrl`） |
| `MediaAttachments` | 附件 |
| `RequiredHttpHeaders` | 播放时必须携带的头 |
| `LiveStreamId` / `OpenToken` / `RequiresOpening` / `RequiresClosing` | 直播流 |
| `HasSegments` / `AnalyzeDurationMs` / `Bitrate` / `Formats` | 分片与分析 |

### 10.5 浏览与检索端点

| 端点 | 关键查询参数 |
| --- | --- |
| `GET /UserViews?userId=` | 媒体库视图（`includeExternalContent`/`presetViews`/`includeHidden`） |
| `GET /Items` | `userId`、`IncludeItemTypes`、`Recursive`、`Fields`、`SortBy`、`SortOrder`、`StartIndex`、`Limit`、`ParentId`、`Filters`、`Genres`、`Tags`、`Years`、`SearchTerm` |
| `GET /Items/{itemId}` | 单项详情 |
| `GET /Items/Counts?userId=` | 计数 |
| `GET /Items/Filters` / `/Items/Filters2` | 可用筛选项 |
| `GET /Shows/{id}/Seasons` / `/Episodes` | 季/集 |
| `GET /Shows/NextUp` | 下一集（`userId`/`limit`/`enableResumable`） |
| `GET /Users/{userId}/Items/Resume` | 继续观看 |
| `GET /Users/{userId}/Items/Latest` | 最新加入 |
| `GET /Users/{userId}/Suggestions` | 推荐 |
| `GET /Artists/InstantMix?userId=&id=` | 即时混合 |
| `GET /Items/{itemId}/Similar` | 相似内容 |
| `GET /Items/{itemId}/SpecialFeatures` | 花絮 |
| `GET /Playlists/{id}/Items` | 播放列表 |
| `POST /Playlists` | 创建播放列表（`name`/`ids`/`userId`/`mediaType`） |
| `GET /LiveTv/Channels` / `/Programs` / `/Recordings` / `/Timers` / `/SeriesTimers` | 直播电视 |
| `GET /LiveTv/GuideInfo` / `/Info` / `/ListingProviders` / `/TunerHosts` | 直播配置 |

**分页**：`StartIndex` + `Limit`，响应体为 `ItemsResult { Items, TotalRecordCount, StartIndex }`。

### 10.6 图片协议

```
GET /Items/{itemId}/Images/{imageType}/{imageIndex}
```

- `imageType`：`Primary`、`Logo`、`Thumb`、`Backdrop`、`Banner`、`Art`、`Disc`、`Box`、`Screenshot`、`Menu`、`Chapter`、`BoxRear`、`Profile`。
- 查询参数（`ImageController.GetItemImage`）：`maxWidth`、`maxHeight`、`width`、`height`、`quality`(0-100)、
  `fillWidth`、`fillHeight`、`tag`（缓存标签，来自 `ImageTags`）、`format`(`Bmp`/`Gif`/`Jpg`/`Png`/`WebP`)、
  `percentPlayed`、`unplayedCount`（已看角标）、`blur`、`backgroundColor`、`foregroundLayer`、`imageIndex`。
- 图片请求**同样需要授权头**（或 `api_key`）。
- 其它图片端点：`/Users/{userId}/Images/{type}`、`/Artists/{name}/Images/{type}`、
  `/Genres/{name}/Images/{type}`、`/Items/{itemId}/Images`（GET 列出，POST/DELETE 管理）。

### 10.7 播放解析流程（PlaybackInfo → 播放）

```
POST /Items/{itemId}/PlaybackInfo?userId=<userId>
Content-Type: application/json
Authorization: MediaBrowser ... Token="<accessToken>"

{ "DeviceProfile": {...}, "MaxStreamingBitrate": 120000000, "StartPositionTicks": 0,
  "AudioStreamIndex": 1, "SubtitleStreamIndex": 1, "MediaSourceId": "...",
  "EnableDirectPlay": true, "EnableDirectStream": true, "EnableTranscoding": true,
  "AllowVideoStreamCopy": true, "AllowAudioStreamCopy": true,
  "AlwaysBurnInSubtitleWhenTranscoding": false, "PlaySessionId": "<uuid>" }
```

返回后客户端按以下优先级选 `MediaSource`：

| 优先级 | 条件 | 播放方式 |
| --- | --- | --- |
| 1 | `SupportsDirectPlay` | 用 `Path` 直接播放（需带 `RequiredHttpHeaders`） |
| 2 | `SupportsDirectStream` | 用 `Path`，但只 Remux 容器（不重编码） |
| 3 | `SupportsTranscoding` | 用 `TranscodingUrl`（服务端已算好） |
| 4 | 都不支持 | 报错 |

`PlaySessionId` 由客户端生成（UUID），后续进度上报与 `LiveStreams` 都用它。

### 10.8 流媒体 URL

#### 10.8.1 直链

```
GET /Videos/{itemId}/stream?api_key=&MediaSourceId=&Static=true
GET /Videos/{itemId}/stream.{container}
GET /Audio/{itemId}/stream[.{container}]
```

#### 10.8.2 HLS 转码（Jellyfin 路由，源码 `Jellyfin.Api/Controllers/DynamicHlsController.cs`）

| 路由 | 方法 |
| --- | --- |
| `/Videos/{itemId}/master.m3u8` | GET、HEAD |
| `/Videos/{itemId}/main.m3u8` | GET |
| `/Videos/{itemId}/live.m3u8` | GET |
| `/Audio/{itemId}/master.m3u8` | GET、HEAD |
| `/Audio/{itemId}/main.m3u8` | GET |
| `/Videos/{itemId}/hls1/{playlistId}/{segmentId}.{container}` | GET |
| `/Audio/{itemId}/hls1/...` | GET |

**`master.m3u8` 的完整查询参数**（源码逐参数抄录）：

`static`、`params`（紧凑串）、`tag`、`deviceProfileId`、`playSessionId`、`segmentContainer`、`segmentLength`、`minSegments`、
`mediaSourceId`(**必填**)、`deviceId`、`audioCodec`、`enableAutoStreamCopy`、`allowVideoStreamCopy`、`allowAudioStreamCopy`、
`audioSampleRate`、`maxAudioBitDepth`、`audioBitRate`、`audioChannels`、`maxAudioChannels`、`profile`、`level`、`framerate`、
`maxFramerate`、`copyTimestamps`、`startTimeTicks`、`width`、`height`、`maxWidth`、`maxHeight`、`videoBitRate`、
`subtitleStreamIndex`、`subtitleMethod`、`maxRefFrames`、`maxVideoBitDepth`、`requireAvc`、`deInterlace`、
`requireNonAnamorphic`、`transcodingMaxAudioChannels`、`cpuCoreLimit`、`liveStreamId`、`enableMpegtsM2TsMode`、
`videoCodec`、`subtitleCodec`、`transcodeReasons`、`audioStreamIndex`、`videoStreamIndex`、`context`、`streamOptions`、
`enableAdaptiveBitrateStreaming`(默认 false)、`enableTrickplay`(默认 true)、`enableAudioVbrEncoding`(默认 true)、
`alwaysBurnInSubtitleWhenTranscoding`(默认 false)。

#### 10.8.3 字幕与花絮

```
GET /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/Stream.{format}
GET /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/{startPositionTicks}/Stream.{format}
GET /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/subtitles.m3u8
POST /Videos/{itemId}/Subtitles        （上传）
DELETE /Videos/{itemId}/Subtitles/{index}
```

`format`：`srt`/`ass`/`ssa`/`vtt`/`sub`/`smi`。

#### 10.8.4 Trickplay（Jellyfin）

```
GET /Videos/{itemId}/Trickplay/{width}/tiles.m3u8
GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg
```

### 10.9 直播电视（Live TV）

| 端点 | 说明 |
| --- | --- |
| `GET /LiveTv/Channels` | 频道列表（`type`、`userId`、`addCurrentProgram`、`enableImages`、`fields`） |
| `GET /LiveTv/Programs` | 节目单（`channelIds`、`minStartDate`/`maxStartDate`、`hasAired`、`isAiring`、`limit`） |
| `GET /LiveTv/Recordings` | 录像（`channelId`、`status`、`isInProgress`、`seriesTimerId`） |
| `GET /LiveTv/Timers` / `/SeriesTimers` | 定时录制 |
| `POST /LiveTv/Timers` / `/SeriesTimers` | 创建定时 |
| `GET /LiveTv/GuideInfo` | EPG 源信息 |
| `GET /LiveTv/ListingProviders`、`/Lineups`、`/SchedulesDirect/Countries` | 节目指南提供商 |
| `GET /LiveTv/TunerHosts`、`/Tuners/{id}/Reset` | 调谐器 |

**打开/关闭直播流**：

```
POST /LiveStreams/Open?userId=&playSessionId=&maxStreamingBitrate=&startTimeTicks=&
    audioStreamIndex=&subtitleStreamIndex=&maxAudioChannels=&itemId=&
    enableDirectPlay=&enableDirectStream=&alwaysBurnInSubtitleWhenTranscoding=&openToken=
Body: OpenLiveStreamDto { OpenToken, UserId, PlaySessionId, MaxStreamingBitrate, ItemId, ... }

POST /LiveStreams/Close?liveStreamId=<id>
```

返回 `MediaSource`，随后用 §10.8 的 URL 播放。**播放结束必须调 `Close`**，否则服务端 FFmpeg 进程不释放。

### 10.10 播放进度与用户数据

| 端点 | 用途 |
| --- | --- |
| `POST /Sessions/Playing` | 开始播放（`ItemId`、`PlaySessionId`、`MediaSourceId`、`PositionTicks`、`CanSeek`、`PlaylistIndex`…） |
| `POST /Sessions/Playing/Progress` | 周期上报（`PositionTicks`、`IsPaused`、`IsMuted`、`Volume`、`PlayMethod`(`DirectPlay`/`DirectStream`/`Transcode`)） |
| `POST /Sessions/Playing/Stopped` | 停止（`PositionTicks`、`PlaylistIndex`） |
| `POST /Users/{userId}/PlayedItems/{itemId}` | 标记已看 |
| `DELETE /Users/{userId}/PlayedItems/{itemId}` | 取消已看 |
| `POST /Users/{userId}/FavoriteItems/{itemId}` | 收藏 |
| `DELETE /Users/{userId}/FavoriteItems/{itemId}` | 取消收藏 |
| `POST /UserItems/{userId}/{itemId}/Rating` / `DELETE` | 评分 |
| `GET /Sessions` / `POST /Sessions/{id}/Command` | 会话管理与远程控制 |

**时间单位**：所有 `*Ticks` 字段为 100ns，`1 秒 = 10,000,000 ticks`。

### 10.11 WebSocket 消息总线

| 项 | Jellyfin | Emby |
| --- | --- | --- |
| 路径 | `/socket` | `/embywebsocket` |
| 连接参数 | `?api_key=<token>&deviceId=<id>` 或 `Authorization` 头 | 同 |

源码依据：`jellyfin-sdk-kotlin/.../DefaultSocketApi.kt:61`（`SOCKET_URL = "/socket"`）。

**订阅协议**（客户端 → 服务端）：

```json
{"MessageType":"SessionsStart","Data":"0,1000"}
{"MessageType":"ActivityLogEntryStart","Data":"0,1000"}
{"MessageType":"ScheduledTasksInfoStart","Data":"0,1000"}
```

对应停止消息 `SessionsStop` / `ActivityLogEntryStop` / `ScheduledTasksInfoStop`。
`Data` 是 `PeriodicListenerPeriod`，格式 `startSeconds,endSeconds`。

**服务端推送**（典型 `MessageType`）：`LibraryChanged`、`UserDataChanged`、`PlaybackStart`、`PlaybackProgress`、
`PlaybackStop`、`SessionEnded`、`Sessions`、`ActivityLogEntry`、`ScheduledTasksInfo`、`KeepAlive`、`RestartRequired`。

**保活**：客户端周期性发送 `ForceKeepAliveMessage`（`{"MessageType":"KeepAlive","Data":0}`），
服务端回 `InboundKeepAliveMessage`。断线按指数退避重连并重新订阅。

### 10.12 Emby / Jellyfin 差异清单

| 能力 | Jellyfin | Emby |
| --- | --- | --- |
| 认证 | 用户名密码 + **QuickConnect** | 用户名密码 + **Emby Connect**（`/Connect/*`） |
| 播放协商 | `DeviceProfile` + `MediaSourceInfo` | 同 |
| HLS | `/Videos/{id}/master.m3u8` 等 | 同 |
| WebSocket | `/socket` | `/embywebsocket` |
| 同步观看 | **SyncPlay**（`/SyncPlay/*`） | 无 |
| 预览图 | **Trickplay** | 无 |
| 媒体库视图 | `/UserViews` | `/Users/{userId}/Views` |
| 设备管理 | `/Devices`（基础） | `/Devices`、`/Devices/Options`、`/Devices/CameraUploads` |
| 频道插件 | 无 | `/Channels/{id}/Items`、`/Channels/Features` |
| 通知 | 基础 | `/Notifications/*` |
| DLNA | `Emby.Dlna` | `Emby.Dlna`（`/Dlna/*`） |
| API Key | `/Auth/Keys` | `/Auth/Keys` |
| OpenAPI | `api.jellyfin.org`（稳定版） | 无公开 OpenAPI |

### 10.13 第三方客户端实现清单

1. **发现**：UDP 广播 + `/System/Info/Public`。
2. **认证**：`POST /Users/AuthenticateByName` → 保存 `AccessToken` + `UserId` + `ServerId`；
   之后每个请求带 `Authorization: MediaBrowser Client=…, Version=…, DeviceId=…, Device=…, Token=…`。
3. **媒体库**：`GET /UserViews?userId=` 拿视图 → `GET /Items?ParentId=&IncludeItemTypes=&Recursive=true&Fields=…`。
4. **详情**：`GET /Items/{id}` + `UserData` + `ImageTags`。
5. **图片**：`GET /Items/{id}/Images/Primary?maxWidth=400&tag=<ImageTags.Primary>`。
6. **播放**：`POST /Items/{id}/PlaybackInfo`（带 `DeviceProfile`）→ 选 `MediaSource` → 直链或 `TranscodingUrl`。
7. **直播**：`GET /LiveTv/Channels` → `POST /LiveStreams/Open` → 播放 → `POST /LiveStreams/Close`。
8. **进度**：播放中每 10s 左右 `POST /Sessions/Playing/Progress`；停止 `POST /Sessions/Playing/Stopped`。
9. **实时更新**：连 `/socket`，订阅 `Sessions`/`LibraryChanged`/`UserDataChanged`，处理 `KeepAlive`。
10. **兼容**：同时接受 `X-Emby-Token`、`api_key`；`ticks` 与毫秒换算（÷10000）。

**Golden 向量**

```http
# 登录
POST /Users/AuthenticateByName HTTP/1.1
Content-Type: application/json

{"Username":"admin","Pw":"1234"}

# 带令牌取媒体库
GET /UserViews?userId=6f2b1a3c8d9e4f0a HTTP/1.1
Authorization: MediaBrowser Client="MyClient", Version="1.0.0", DeviceId="abc123", Device="Pixel", Token="8f3a...">

# 播放协商
POST /Items/9c1b7f2e3a4d5e6f/PlaybackInfo?userId=6f2b1a3c8d9e4f0a HTTP/1.1
Content-Type: application/json

{"DeviceProfile":{"Name":"MyClient","DirectPlayProfiles":[{"Container":"mp4,mkv","Type":"Video"}],"TranscodingProfiles":[{"Container":"ts","Type":"Video","Protocol":"hls","Context":"Streaming"}],"SubtitleProfiles":[{"Format":"srt","Method":"External"}]}}

# HLS 播放
GET /Videos/9c1b7f2e3a4d5e6f/master.m3u8?mediaSourceId=ms1&playSessionId=ps1&segmentContainer=ts&transcodingMaxAudioChannels=2&requireAvc=false&api_key=8f3a... HTTP/1.1
```

---

# 第三部分 附录

## 11. 附录

### 11.1 参考仓库与开源实现的实测统计

**仓库 A：`a736240087/tvbox`（外置配置源）**

| 文件 | sites | lives | parses | flags | rules | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `1.json` | 46 | 1 | 4 | — | 9 | `spider=./jar/jinenge.jar;md5;9cc29f…` |
| `2.json` | 31 | 1 | 7 | 31 | 1 | `spider=./jar/cc.jar;md5;125712f…`（**md5 与实际不符**） |

- 目录：`jar/`（3 个 dex jar）、`js/`（34 个）、`json/`（10 个）、`tvlive/`（txt + m3u）。
- `type` 分布：`3` 占 71 条、`1` 占 6 条（采集站：`zzdj.cc`、`zy.xiaomaomi.cc`、`vipmv.cc`、
  `cj.vodimg.top`、`anltv.cn`、`fszy1.com`）。
- `api` 分布：`./js/通用api数据.js`×15、`csp_Panda`×8、`csp_Bili`×9、`./js/doubanshuju.js`×7。
- site 字段出现次数：`ext` 54、`searchable` 44、`quickSearch` 42、`changeable` 13、
  `playerType` 17（**字符串 13 / 整数 4**）、`style` 9、`filterable` 26、`timeout` 2、`jar` 8。
- md5 实测：`jinenge.jar` ✅、`通用.jar` ✅、`cc.jar` ❌（实际 `a62fec72…`）。

**仓库 B：`jinenge/tvbox`（内置配置版）**

| 项 | 值 |
| --- | --- |
| 配置 | `tvbox.json`（26,827 字节，**根对象后拼接了第二份 sites，严格 JSON 不合法**） |
| sites | 42（根，生效）+ 42（尾部，不生效） |
| lives | 7（`./lib/interface.txt` + 6 个 m3u） |
| parses / flags | 根无（尾部 4 条不生效） |
| rules / hosts / logo | 1 / 2 / 1 |
| `lib/` | `jinenge.jar`（加固版）、`drpy2.min.js`、`模板.js`、`虎牙.js`、`斗鱼直播.js`、`兔小贝.js`、7 个 hex txt（csp_Bili 数据）、6 个 m3u、`cheerio/crypto-js/jinja/json5/pako/gbk/node-rsa` |

**两仓库机制差异**

| 维度 | 仓库 A | 仓库 B |
| --- | --- | --- |
| 配置形态 | 2 份合法 JSON | 1 份拼接导致非法的 JSON |
| jar | 3 个明文 dex 包（942/688/460 KB），多 jar 拼装 + 8 个 site 级覆盖 | 1 个 966KB 加固包（36KB dex + 849KB 加密载荷 + 2 个 OLLVM so） |
| csp 命名 | 裸功能名（`Panda`/`Bili`/`Kuaikan`），28 种 | `*Guard` 加固名，配置用 27/58 种 |
| drpy2 引擎 | `通用api数据.js`（43KB 可读，3.9.48beta16）+ `doubanshuju.js`（3.9.47beta1）+ GB18030 副本 | `drpy2.min.js`（65KB 压缩版） |
| ext 主用法 | 本地相对路径（15 个 js + 7 个 json）+ 内联 panda 规则 + 3 个盘搜 dict | dict ext（16 个）+ 密文串（13 个）+ URL |
| 直播 | 1 条 txt（50 频道） | 7 条（318 + 1403 + 1260 + 956 + 594 + 119 + 67 频道） |
| 加固 | 无 | native so + 加密 dex + `hosts` 劫持 |

**开源客户端：`peter-wins/TVBoxOS-M3`（AGPL-3.0，`q215613905/TVBoxOS` 的 Media3 换代分支）**

| 项 | 值 |
| --- | --- |
| Gradle 模块 | `:app` / `:player` / `:quickjs` / `:pyramid` |
| 播放内核 | Media3 1.8.0 + `media3-ffmpeg-decoder 1.8.0+1` + DKVideoPlayer（`xyz.doikki.videoplayer`）+ ijkplayer |
| 爬虫实现 | `JarLoader` / `JsLoader` / `ProtectedInitJar` / `SpiderNull` / `SpiderDebug` / `SpiderApi` / `IPyLoader` |
| QuickJS 层 | `Async` `Connect` `Crypto` `FunCall` `Global` `HtmlParser` `JsSpider` `Json` `Req` `Res` `Trans` `local` + `rsa/{DataUtils,RSAEncrypt}` |
| Python 层 | `pyramid/`（`base/spider.py` `base/htmlParser.py` `base/localProxy.py` `app.py` `runner.py` `trigger.py` `crypto_protocol_dh.py`） |
| 字幕 | 5 格式（`SRT`/`ASS`/`SCC`/`STL`/`TTML`）+ `SubtitleEngine` 策略 + `SimpleSubtitleView` |
| 投屏 | Cling（`MediaRenderer:1` + `AVTransport:1`），自研 `OkHttpStreamClient` + `SocketHttpStreamServer` |
| EPG | SAX 流式 `XmlTvParser`，`MAX_EPG_CACHE_SIZE=60`，切台取消 + generation 校验 |
| 测试 | `tests/HomeMetadataTest.java`（12 条）、`tests/XmlTvParserTest.java`（频道名归一化 + 跨午夜 + 坏时间戳） |
| 包体 | `assembleJava32Release`（armeabi-v7a）/ `assembleJava64Release`（arm64-v8a） |
| 直播实测 PSS | IJK 约 350MB → Media3 约 190–215MB |

### 11.2 `csp_*` 类名清单（dex 实测）

**仓库 A `jinenge.jar`（1729 类 / 86 个 spider 顶级类）**
`AList Ali Anime1 AppMao AppSK AppYs AppYsV2 Appto Auete Bili Bttwoo Czsapp Ddrk Dm84 FirstAid IQIYI Init Init6 Kunyu77 Libvio Local MGTV MYYS NanGua NiNi Panda Proxy Proxy6 PushAgent SP360 UpYun XBiu Xinsj YGP YQKan YiSo Yj1211 Youtube Ysj Zxzj`

**仓库 A `通用.jar`（740 类 / 60 个）**
`AList Ali Anime1 AppRZ AppYs AppYsV2 Auete Bili BookTing Cs1369 Czsapp Dm84 Douban Dovx Duanju FirstAid Freeok Hmys Init Jianpian Kanqiu Kuaikan Kugou Local Market Nmys PanSearch PanSou PiaoHua Proxy Push SP360 SixV UpYun Voflix Wogg XBPQ XiaoZhiTiao Xifan Xinsj`

**仓库 A `cc.jar`（960 类 / 131 个）**
`AList Ali Anime1 AppMr AppYsV2 Auete BH Bili Cokemv Czsapp Ddrk Dm84 DouDou Dovx Fantuan Init Init1 Itv Jianying Kuaikan Kunyu77 Kuying Libvio Local Mtv NiNi Nmys Opnxng PanSearch PanSou Proxy Push Qtv SP33 SixV Tangrenjie UpYun Voflix WebDAV WoGG XBPQ XBiu XPath XPathFilter XPathMac XPathMacFilter XYQBiu Xinsj YGP YQKAPP YTVIP YiSo Ying Yj1211 Youtube Ysgc Ysj Zhaozy ZhuanX Zxzj hg`

**仓库 B `jinenge.jar`（74 类 / 49 个，全 `*Guard`）**
`AListGuard AllliveGuard Anime1Guard AppNoxGuard AppSKGuard AppSxGuard AppTTGuard AppYsV2Guard AueteGuard BaseSpiderGuard BiliGuard BpanSoGuard BttwooGuard DexNative Dm84Guard DouDouGuard FirstAidGuard Init JPJGuard JpysGuard JqqGuard KanqiuGuard KkSsGuard LibvioGuard LiveGzGuard LocalGuard MIPanSoGuard MusicGuard MyDriveGuard NewCzGuard NmyswvGuard Proxy PushGuard S_zpsGuard SeedhubGuard Sir88Guard SixVGuard T4Guard Tingshu275Guard UuSsGuard WebDAVGuard WoGGGuard YCyzGuard YGPGuard YoutubeGuard YpanSoGuard ZbzGuard`

> 四个 jar 的 dex 字符串表里 `csp_*` 字面量为 **0** —— 证实 `csp_` 只是壳层分发前缀。
> 仓库 B 的 jar 是「壳 + 加密载荷」结构：49 个 `*Guard` 空壳类 + `BaseSpiderGuard` + `DexNative`，
> 真实逻辑在 `assets/ftyshinidie.guard`（849KB 加密 deflate 流）+ `ftyguard_v7/v8.so`（OLLVM 8.0 混淆）。

### 11.3 字段速查表

**顶层配置**：`spider` `sites` `lives` `parses` `flags` `rules` `ads` `doh` `ijk` `wallpaper` `epg`
`logo` `hosts` `msg` `urls`(多仓订阅) `assrt` `notice` `danmaku` `headers` `proxy`

**site**：`key` `name` `type` `api` `ext` `jar` `searchable` `quickSearch` `filterable` `changeable`
`playerType` `playUrl` `categories` `timeout` `style` `indexs` `gridview` `click` `hide` `header` `lang`

**live 源**：`name` `url` `api` `ext` `jar` `click` `logo` `epg` `ua` `origin` `referer` `timeZone`
`keep` `timeout` `header` `catchup` `core` `groups` `boot` `pass`

**live 频道**：`name` `urls` `url` `tvg-id` `tvg-name` `tvg-logo` `tvg-chno` `group` `epg` `header` `drm`

**parse**：`name` `url` `type` `ext` `header`

**rule（drpy2）**：`title` `host` `homeUrl` `url` `detailUrl` `searchUrl` `headers` `timeout`
`encoding`/`编码` `search_encoding`/`搜索编码` `图片来源` `模板` `hostJs` `预处理` `cate_exclude`
`tab_exclude` `double` `limit` `searchable` `quickSearch` `filterable` `filter_url` `filter` `filter_def`
`class_name` `class_url` `class_parse` `pagecount` `params` `推荐` `一级` `二级` `搜索` `二级访问前`
`重定向` `lazy` `play_parse` `play_json` `sniffer` `isVideo` `proxy_rule` `tab_remove` `tab_order` `tab_rename`

**Vod**：`vod_id` `vod_name` `type_name` `vod_pic` `vod_remarks` `vod_year` `vod_area` `vod_actor`
`vod_director` `vod_content` `vod_play_from` `vod_play_url` `vod_play_id` `vod_tag` `action` `style` `cate`

### 11.4 已知坑与不兼容点

| # | 问题 | 影响 | 规避 |
| --- | --- | --- | --- |
| 1 | 配置含 `//` 注释、尾逗号 | 严格 JSON 解析器直接失败 | 必须 lenient 解析 |
| 2 | `tvbox.json` 根对象后拼接第二份配置 | 尾部 42 个站点 + 4 个 parses 静默失效 | 宽松解析只读第一个完整值 |
| 3 | `cc.jar` 的 md5 与文件不符 | 该配置的 19 个 `csp_*` 站点全空壳 | md5 只作缓存键，不阻断加载（本地路径直接加载） |
| 4 | `fatcat.jar` 复用 `通用.jar` 的 md5 | 该站点加载失败 | 每个 jar 用各自 md5 |
| 5 | `1.json` 的 `csp_Xifan` 两个 jar 都没有 | 该站点 `ClassNotFoundException` | 类名必须与 jar 内一致 |
| 6 | `js/` 缺 `模板.js` 与 `gbk.js` | `doubanshuju.js`/`儿童启蒙api数据.js` 的 import 404，模板继承静默失败 | 用绝对 URL 或补齐依赖 |
| 7 | `儿童启蒙api数据.js` 删了 gbk import 仍调 `gbkTool()` | GBK 搜索抛 `ReferenceError` | 保持 import 与调用一致 |
| 8 | `js.js` 是 GB18030 编码 | 按 UTF-8 读取即乱码 | 按 BOM/声明探测编码 |
| 9 | txt 直播 43/50 条带 `$LR—IPV4` 后缀 | 壳不剥离，URL 带垃圾后缀 | 客户端容错或清洗 |
| 10 | `live.m3u` 内容是 txt、`interface.txt` 内容是 m3u | 靠扩展名判断格式会失败 | **按内容嗅探** |
| 11 | `ext` 六种形态（路径/URL/密文/短串/对象/空） | 单一解析路径必然失败 | 多态解析，对象序列化成字符串 |
| 12 | `playerType` 字符串与整数混用 | 类型强转异常 | 两者都接受 |
| 13 | `csp_WoGG` 与 `csp_Wogg` | 大小写敏感，是不同类 | 严格按 jar 内类名书写 |
| 14 | `Cloud-drive.txt`、`酷奇MV.js`、`短视频.js` 被引用但不存在 | 站点空壳 | 上线前校验引用完整性 |
| 15 | `初中课堂.json` filter=66 vs classes=16 | 多余 key 是死数据 | 容错处理 |
| 16 | 部分 jar 用 native so + 加密 dex 加固 | 无法静态分析/复用类名 | 只能整体加载运行 |
| 17 | `interface.txt` 的 URL 带短时效鉴权参数 | 列表能加载但多数不能播 | 视为「需重新抓取」的源 |
| 18 | 配置可能是**密文**（`;pk;`、`[A-Za-z0-9]{8}**`、`2423` 前缀） | 直接当 JSON 解析失败 | 按 §3.1.1 顺序逐级尝试解密 |
| 19 | classic 客户端**不支持** `rules`/`hosts`/`doh`/`headers`/`proxy`，且 `loadJar` **不解析相对路径** | 同一份配置在 classic 上行为不同 | 按 engine 语义实现，classic 作降级 |
| 20 | 配置里的 `doh` 数组在原版中**未接到 OkDns** | 配了 DoH 却不生效 | 第三方可选择真正接上 |
| 21 | `site.indexs`/`hide`/`timeout`/`changeable` 字段存在但**无调用方** | 写了不生效 | 不要依赖 |
| 22 | `gridview`、`site.lang`、`liveSettings`、`videoTypes`、`warnings` 在配置里出现但**客户端无解析代码** | 写了不生效 | 忽略 |
| 23 | 社区流传的 URL 后缀 `;p ;j ;u ;r ;m ;s` 协议**不存在** | 按此实现会误伤含 `;` 的 CDN 签名 URL | 见 §5.7.1，默认关闭 |
| 24 | `playerContent.timeshift` 本 fork 未解析 | 直播回看时间轴不显示 | 用 m3u `catchup` 替代 |
| 25 | WebView 嗅探**不检查 Content-Type、无 PlayerType 白名单** | 可能误判非视频地址 | 靠 URL 正则 + `rules` + 爬虫 `isVideoFormat` |
| 26 | `parses[].url` **无 `{xx}`/`@` 占位符**，是前缀拼接 | 按模板替换会拼错地址 | 直接拼接，带 `?` 时追加 `cat_ext` |
| 27 | 端口上限差 1（engine 9998 / classic 9999） | 端口探测逻辑不一致 | 从 9978 起递增到第一个可用 |
| 28 | `pyramid` 框架的 `fetch`/`post` **无条件 `rsp.encoding='utf-8'`** | 声明 GBK 的站点整页乱码 | 改为「响应头 charset 优先，无则 utf-8」 |
| 29 | `pyramid` 的 `Runner`/`Trigger` 壳**不转发 `action`** | Python 源的交互对话框能力缺失 | 宿主对 `action` 做存在性检查，缺失即视为无 |
| 30 | `SpiderApi.multiReq` 线程池上限 **6** 且任一项异常**整体返回 `""`** | 批量请求部分失败即全丢 | 自己实现时改为逐项容错并保留顺序 |
| 31 | `SpiderApi.getPort()` 从地址字符串末段切分，取不到返回 `""` | 端口为空导致缓存/代理 URL 拼接失败 | 加端口默认值兜底 |
| 32 | Python `requests` 的 TLS 指纹（JA3）与浏览器差异大 | 被 WAF 固定返 `403` | 按 §7.13.7 增加「原生 HTTP 客户端兜底」，触发码 `403/429/495/496/497/525/526/527` |
| 33 | `TVBoxOS-M3` 为 **AGPL-3.0** | 直接链接/分发其代码会传染许可 | 只按本文档重新实现协议，或同样以 AGPL 开源 |
| 34 | `ExperimentalFfmpegVideoRenderer` 上游标注 `TODO: Implement` | 视频软解实际不可用 | 软解只当音频兜底，视频走硬解 |
| 35 | 上游打包了 `libffmpegJNI.so` 但**从未调用初始化** | 以为有软解，实际没有 | 必须显式注册 renderer 并探测 `FfmpegLibrary.isAvailable()` |
| 36 | `pyramid` 的 `URLJOIN_ATTR` **不含 `style`** | 背景图等内联样式的相对 URL 不补域名 | 自行扩展属性清单 |
| 37 | `XmlTvParser.normalizeChannelName` 步 4 对非 CCTV 名返回**未删空格的原样 trim** | `北京 卫视` 与 `北京卫视` 对不上 | 归一化与显示用两套名字，匹配前统一过一遍该函数 |
| 38 | **`net` API 按引擎而变**：M3 的 `net.js` 只有 `req`/`http` | 按 FongMi 文档写 `net.json/post/batch` 的源在 M3 上直接报未定义 | 同时提供三套名字空间（§7.1.2） |
| 39 | **`site.click` 后半段是任意 JS，且不自动补 `.click()`** | 源里只写 `#id` 时期望自动点击，实际什么都不发生 | 源里写完整 JS；宿主原样 `evaluateJavascript`（§5.7） |
| 40 | `.ttml` 被分派到 **`FormatSTL`** | TTML 字幕解析结果错乱 | 分派表改成 `.ttml → FormatTTML`（§5.12.1） |
| 41 | `SocketHttpStreamServer` **不是媒体文件服务器** | 以为投屏要经本地代理中转媒体，实际没有 | 媒体由渲染器直连 `<res>` URL（§5.13.4） |
| 42 | 「附近 TVBox」是 **HTTP 扫描 9978/action**，不是 SSDP/DLNA | 与 DLNA 设备列表混在一起，误判为同一机制 | 分开实现（§5.13.5） |
| 43 | `/action` 无论 `do` 是否匹配都返回 `"ok"` | 以为 `"ok"` 表示动作成功 | 只当「设备在线」信号（§5.13.5） |
| 44 | `pl` 的外部播放器**不统一传 headers**：VLC 完全不传 | 需要鉴权的源投到 VLC 播不了 | 按播放器分别处理（§5.8.3） |
| 45 | `//bb` / `//DRPY` 字节码与引擎版本绑定（`BYTECODE_VERSION=67`） | 换引擎版本后字节码缓存全部失效 | 带版本号，不匹配回退源码执行（§7.1.3） |
| 46 | 顶层 `ijk` 在 M3 **不被读取** | 配了 `ijk` 想调解码参数，实际无效 | 软/硬解切两组内置 option（§5.8.3） |
| 47 | 顶层 `assrt` 键不存在，字幕站是硬编码 HTML 爬取 | 想换字幕站换不了 | 自行实现 `SubtitleEngine` 策略替换 |
| 48 | QuickJS 运行时是 `wang.harlon.quickjs` fork，不是 caoccao 原版 | 按原版 API 写的桥接层可能缺方法 | 用 `:quickjs` 模块或直接依赖 2.1.0（§7.1.1） |
| 49 | 嗅探**只取第一个候选**且总超时 20s | 期望「收集所有候选再挑」会超时 | 改为可配置或并发预取（§5.7） |
| 50 | `proxy` 返回值格式由 `from=catvod` 决定（数组 vs 对象） | 只实现一种解包，另一种全失败 | 两种都实现（§7.1.4） |
| 51 | Python 蜘蛛的 `isVideoFormat`/`manualVideoCheck` 在桥接层**硬编码 `false`** | py 源无法否决内置嗅探规则（例如拦不掉 `/ad/xxx.mp4`） | 桥接层改为可转发到 Python（§7.13.9.4） |
| 52 | Python 源返回的 `http://127.0.0.1:UndCover/proxy` 是**占位符**，需宿主替换 | 不替换则播放地址 127.0.0.1 无法连接 | 实现 `replaceLocalUrl`（§7.13.9.6） |
| 53 | `py` 源的 `init` 有 **30s 超时**且超时**不中断** | 慢插件会拖 30s 后静默返回空蜘蛛 | 缩短超时或改为可中断（§7.13.9.3） |
| 54 | `IPyLoader` 接口在 M3 与 DV 版**签名不同**（DV 少一个 `proxyInvoke` 重载） | 按某一版写死在另一版 `NoSuchMethodError` | 反射探测或 try/catch 调用（§7.13.9.7） |
| 55 | **DV 版没有 `/cache` 路由** | py 源的 `getCache` 拿到 HTML 当缓存值 | 自带 `/cache`，非 JSON 返回空（§7.13.6） |
| 56 | DV 版插件目录硬编码 `/storage/emulated/0/plugin/` 且**要存储权限** | 未授权时所有 py 源静默返回 `SpiderNull` | 先申请权限，或改用应用私有目录（§7.13.8.1） |
| 57 | DV 版 `extend=` **不 URL 编码** | ext 含 `&`/`#`/空格会破坏 query | 源侧保证 ext URL 安全；宿主侧改为编码（§7.13.8.1） |
| 58 | `parse` **只认字符串 `"1"`** | 爬虫返回 JSON 数字 `1` 时不进解析流程 | 统一返回字符串（§5.2.1） |
| 59 | `runner.py`/`trigger.py` 在 DV 版是**死代码** | 以为 DV 版也有 HTTPS→Java 兜底，实际没有 | 只在 M3 系依赖该机制（§7.13.7） |
| 60 | DV 版 `playerType` 的 `1`/`2`（IJK/EXO）**无效**，`updateCfg` 强制改回 `0` | 配置要求 EXO 却被拉回系统内核 | 按目标分支决定默认值（§5.8.1.0） |
| 61 | `lives[].type` 的 `"1"`/`"2"` 在 DV 版落入 `clear()+return`（**清空直播列表**） | 直播全空且无提示 | 未知 type 按默认嗅探处理，别清空（§6.1） |
| 62 | `push://` 的 URL 用 `\|` 接头信息，与直播行的 `URL\|k=v` 不是同一套 | 推送到附近 TVBox 时头丢失 | 两套约定分开实现（§8.2.1 / §8.10） |
| 63 | `HawkConfig.DEFAULT_LOAD_LIVE` 是**大写键**；`PLAYER_SELECTION_MANUAL = "manual"` 不是独立键 | 按驼峰猜键名读不到 | 逐个对照 §5.8.0 的键表 |
| 64 | Room `addMigrations` **全部被注释**，`DB_FILE_VERSION` 一变即新库 | 升级后历史/进度全丢 | 自己写迁移（§8.9） |
| 65 | 播放进度 key 是 `md5("<sourceKey>\|<vodId>\|<flag>\|<index>")` 存在 `cache` 表 | 按 URL 或 vodId 单独做 key 会与旧数据不兼容 | 严格按四段拼接（§8.9） |
| 66 | `data:application/dash+xml;base64,` 内联 MPD 与 `tvbox-xg:`/`push://`/`img+` 前缀不识别 | 起播失败或图片不显示 | 见 §5.10.1 |

### 11.5 待确认事项

1. `vod_play_id` 在 SDK 与文档中存在，但客户端引擎的 `Vod` 模型无该字段——目标客户端是否支持需实测。
2. `danmaku()`/`dialog()`/`proxyUrl()` 只存在于爬虫编译用 SDK，宿主侧未实现，需配套客户端版本。
3. `catvod` JS 模块（`import {Spider, htmlQuery, link, page} from "catvod"`）无实体文件，应内置于 QuickJS 运行时 APK。
4. 两套 `local`：全局三参 `local(rule,key)` 不隔离，源级 1 参形式才按站点隔离——JS 源应使用 1 参形式。
5. AList 的 `{vodPic, drives}` 外壳与 `&sign=` 续签仅见于魔改 jar，源码版不读取 `vodPic`。
6. 缺 jar 时 `pdfh/pdfa/pd` 未定义，drpy 的 `typeof pdfl==="function"` 会降级，但默认分支调 `pdfh` 会抛错。
7. `lives[].type` 与 `lives[].playerType` 在现代引擎的 `Live` bean 中不存在（被忽略），但其它分支可能使用。
8. 仓库 B 的 `ftyshinidie.guard` 解密后的真实 dex 未解出（需 native 逆向）。
9. `site.type=4` 的完整 HTTP 契约（请求方法、鉴权方式、响应包装）只能反推，无文档与样例。
10. 对象型 `flags`（`{name,show,urls,delay,headers}`）在三份源码中均不存在，来源分支不明。
11. HTML 壁纸页抓 `<img>` 未实现，只支持「非图片响应按配置文本递归」。
12. `2423` 专用 CBC 的完整字节布局（key 与 iv 的精确偏移）只读到注释级描述，未逐字节验证。

### 11.6 参考链接

| 资源 | 地址 |
| --- | --- |
| 配置仓库 A | https://github.com/a736240087/tvbox |
| 配置仓库 B | https://github.com/jinenge/tvbox |
| 爬虫 SDK 与文档 | https://github.com/FongMi/CatVodSpider |
| Emby 服务端源码 | https://github.com/MediaBrowser/Emby |
| Jellyfin 服务端源码 | https://github.com/jellyfin/jellyfin |
| Jellyfin OpenAPI | https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json |
| Jellyfin Kotlin SDK | https://github.com/jellyfin/jellyfin-sdk-kotlin |
| Jellyfin Android TV 客户端 | https://github.com/jellyfin/jellyfin-androidtv |
| TVBoxOSC 分支（客户端参考） | https://github.com/kukuqi666/TVboxOSC |
| TVBoxOSC-LiveOnly（最小 classic 骨架） | https://github.com/cddlsjy/TVBoxOSC-LiveOnly |
| **TVBoxOS-M3**（Media3 换代 + pyramid + EPG + DLNA，AGPL-3.0） | https://github.com/peter-wins/TVBoxOS-M3 |
| TVBoxOS-M3 上游 | https://github.com/q215613905/TVBoxOS |
| TVBOX-DolbyVision-HDR10-Edition（classic 支线 + DV/HDR） | https://github.com/louisYKL/TVBOX-DolbyVision-HDR10-Edition |
| DKVideoPlayer（播放器控制层） | https://github.com/Doikki/DKVideoPlayer |
| media3-ffmpeg-decoder（FFmpeg 软解） | https://github.com/jellyfin/media3-ffmpeg-decoder |
| QuickJS-NG（JS 引擎） | https://github.com/quickjs-ng/quickjs |

> 访问日期均为 2026-11-13。TVBox 官方仓库 `CatVodTVOfficial/TVBoxOSC` 已不可访问（DMCA），
> 上表所列分支与衍生实现是当前仍可核验协议的一手来源。

### 11.7 与本文档对应的实测文件索引

第三方实现若要对齐某个具体行为，可直接查这些文件（仓库见上表）：

| 行为 | 文件 |
| --- | --- |
| 配置 JSON 全量键解析 | `kukuqi666/…/api/ApiConfig.java` |
| 直播格式内容嗅探 | `kukuqi666/…/engine/api/parser/LiveParser.java` |
| `Live` bean（无 `type`/`playerType`） | `kukuqi666/…/engine/bean/Live.java` |
| 播放内核设置键 `PLAY_TYPE` | `kukuqi666/…/util/HawkConfig.java` |
| `site.type` 注释语义 | `cddlsjy/…/bean/SourceBean.java` |
| `parses[].type` 注释语义 | `cddlsjy/…/bean/ParseBean.java` |
| XML 影片字段全表 | `cddlsjy/…/bean/Movie.java` |
| JAR 爬虫反注入 API | `TVBoxOS-M3/app/…/com/github/catvod/crawler/SpiderApi.java` |
| Python 框架宿主契约 | `TVBoxOS-M3/pyramid/src/python/base/spider.py` |
| Python 框架规则串解析 | `TVBoxOS-M3/pyramid/src/python/base/htmlParser.py` |
| Python 框架分发器 | `TVBoxOS-M3/pyramid/src/python/app.py` |
| HTTPS→Java HTTP 兜底 | `TVBoxOS-M3/pyramid/src/python/trigger.py` |
| EPG 频道名归一化 + 黄金向量 | `TVBoxOS-M3/app/…/util/XmlTvParser.java`、`TVBoxOS-M3/tests/XmlTvParserTest.java` |
| Python 框架分发器 | `TVBoxOS-M3/pyramid/src/python/app.py` |
| Chaquopy 桥接层 | `TVBoxOS-M3/app/src/python/java/com/undcover/freedom/pyramid/{PythonLoader,PythonSpider,PythonHttp,PyToast,PyLog}.java` |
| 无 Python 的空实现 | `TVBoxOS-M3/app/src/normal/java/com/github/catvod/crawler/pyLoader.java` |
| QuickJS 宿主注入 | `TVBoxOS-M3/app/…/com/github/catvod/crawler/js/Global.java` |
| QuickJS `net.js`（仅 req/http） | `TVBoxOS-M3/app/src/main/assets/js/lib/net.js` |
| jar 加载与多 jar 架构 | `TVBoxOS-M3/app/…/com/github/catvod/crawler/JarLoader.java` |
| 加固 dex 识别 | `TVBoxOS-M3/app/…/com/github/catvod/crawler/ProtectedInitJar.java` |
| 弹幕解析与搜索 | `TVBoxOS-M3/app/…/bean/Danmu.java`、`app/…/api/DanmakuApi.java` |
| HDR/DV 路由 | `TVBOX-DolbyVision/…/util/{DolbyVisionPlaybackRouter,HdrDeviceSupport,SystemDecoderRoutePolicy,VideoStreamProbe}.java` |
| HDR 判定与 RPU 剥离 | `TVBOX-DolbyVision/…/player/{SystemCodecHdrPolicy,DolbyVisionRpuStripper}.java` |
| 字幕 HDR 样式决策 | `TVBOX-DolbyVision/…/subtitle/SubtitleHdrStylePolicy.java` |
| WebDAV 浏览 | `TVBOX-DolbyVision/…/webdav/{WebDavClient,WebDavConfig,WebDavEntry}.java` |
| 附近 TVBox 探活 | `TVBoxOS-M3/app/…/player/thirdparty/RemoteTVBox.java` |
| `/action` 远程管理 | `TVBoxOS-M3/app/…/server/InputRequestProcess.java` |
| drpy2 引擎（3.9.48beta16） | `a736240087/tvbox/js/通用api数据.js` |
| drpy2 真实规则样例 | `a736240087/tvbox/js/南瓜配置.js` |
| drpy2 模板表（10 套） | `jinenge/tvbox/lib/模板.js` |
| Emby 令牌回退顺序 | `MediaBrowser/Emby/…/Security/AuthorizationContext.cs` |
| Jellyfin HLS 路由 | `jellyfin/jellyfin/Jellyfin.Api/Controllers/DynamicHlsController.cs` |
| Jellyfin WebSocket URL | `jellyfin/jellyfin-sdk-kotlin/…/DefaultSocketApi.kt` |
| 授权头权威格式 | `jellyfin/jellyfin-sdk-kotlin/…/AuthorizationHeaderBuilder.kt` |







---

## 12. 本版新增内容索引（v1.1 / v1.2 / v1.3）

以下条目为 v1.1 相对 v1.0 新增，全部来自 2026-11-13 对四个开源实现的**一手源码阅读**：

| 新增章节 | 来源 | 一句话 |
| --- | --- | --- |
| [§2.1 可抄骨架的开源实现](#21-可抄骨架的开源实现按用途选) | 全部 | 按用途选仓库 + AGPL 警示 |
| [§4.3.2.1 jar 五种来源协议](#4321-jar-字段的五种来源协议m3-jarloader-实测) | M3 `JarLoader` | `clan://`、`assets://`、`file:/`、md5 的「一周」缓存规则 |
| [§4.3.2.2 多 jar 架构](#4322-多-jar-架构与-sitejar) | M3 `JarLoader` | `site.jar` + `MAIN_KEY` + `className()` 规则 |
| [§4.3.2.3 jar 内四个静态入口](#4323-jar-内可选的四个静态入口比官方文档多两个) | M3 `JarLoader` | `Danmaku.onClick/onLongClick`、`Json{key}`、`Mix{key}` |
| [§4.3.2.4 端口注入与反逆向](#4324-端口注入与-protectedinitjar反逆向) | M3 | `ProtectedInitJar` dex 静态分析、AES 包名白名单 |
| [§4.3.3.0 运行时基类差异](#4330-运行时基类的实现差异m3-vs-官方-sdk) | M3 `Spider.java` | org.json vs Gson、`proxy/proxyLocal` 双签名、`initApi` |
| [§4.3.3.1 SpiderApi](#4331-spiderapi宿主反向注入给-jar-爬虫的能力) | M3 `SpiderApi.java` | `multiReq`（6 线程）、`webParse` → `proxy://go=SuperParse` |
| [§4.8 简介抓取与 HTML 清理](#48-详情简介抓取与-html-清理黄金向量) | M3 `HomeMetadata` + 测试 | 12 条黄金向量、身份匹配三道闸门 |
| [§4.9 WebDAV/AList 浏览](#49-webdav--alist-远程目录浏览dv-版可直接实现) | DV 版 `webdav` | `PROPFIND` + `Depth:1` + 端口 5244 |
| [§5.8.0 设置键清单](#580-设置键清单第三方实现做设置页时对照) | DV 版 `HawkConfig` | 40+ 键；`play_type` 语义按分支而变 |
| [§5.8.1 播放内核选型](#581-播放内核选型的实测数据tvboxos-m3agpl-30) | M3 README | Media3 换代、PSS 350→190MB、软解真相 |
| [§5.8.2 DV/HDR 能力路由](#582-dolby-vision--hdr-能力路由louisykl-dv-版可直接实现) | DV 版 6 个类 | 三级设备探测、HDR 判定、RPU/EL 剥离、字节预算 |
| [§5.12.1 字幕引擎](#5121-字幕引擎支持格式tvboxos-m3-实测) | M3/DV `subtitle` | 5–6 格式、HDR 字幕样式决策 |
| [§5.12.2 弹幕解析规范](#5122-弹幕danmaku完整解析规范) | M3 `Danmu` + `DanmakuApi` | 三级兜底、非法实体修复、搜索 API |
| [§5.13 DLNA 投屏](#513-dlna--upnp-投屏) | M3 `dlna` | SSDP/AVTransport 序列、DIDL-Lite、头塞 `dc:description` |
| [§6.5.1 频道名归一化](#651-频道名归一化xmltvparsernormalizechannelname可直接实现) | M3 `XmlTvParser` + 测试 | 5 条黄金向量、四步算法 |
| [§6.5.2 XMLTV 解析语义](#652-xmltv-解析语义sax含时间与过滤规则) | M3 `XmlTvParser` | 时区、日窗口、XXE 关闭、取消 |
| [§7.1.1 QuickJS 引擎选型](#711-quickjs-引擎的可选实现第三方落地参考) | M3 `:quickjs` | 运行时实为 `wang.harlon.quickjs:2.1.0`，经空壳模块 `api` 引入 |
| [§7.1.2 `net` API 按引擎而变](#712--net-api-按引擎而变最常见的兼容性错误) | M3 `assets/js/lib/net.js` | **M3 只有 `req`/`http`**；FongMi 的整套 `net.*` 是另一套引擎 |
| [§7.1.3 JS 模块三种入口](#713-js-模块的三种入口契约m3-jsspider-实测) | M3 `JsSpider` | `export default` / `__jsEvalReturn` / `__JS_SPIDER__`；`//bb`/`//DRPY` 字节码 v67 |
| [§7.1.4 `proxy` 双通道](#714-proxy-的双通道协议fromcatvod-分流) | M3 `JsSpider` | 无 `from=catvod`→5 元数组；有→`{code,buffer,content,headers}` |
| [§7.13 pyramid Python 框架](#713-tvbox-原生-python-框架pyramidtvboxos-m3-实测) | M3 `pyramid/` | 入口签名、`init` 双态、规则串、`/cache`、**HTTPS→Java 兜底** |
| [§8.8 端口分配与远程管理](#88-本地服务端口分配与远程管理源码级) | M3 `ControlManager` | 端口 do-while、`DataReceiver` 五回调、`setDotPort` |
| [§9.3 关键实现细节 14–30](#93-关键实现细节清单易错点) | 综合 | 新增 17 条易错点 |
| [§11.1 开源客户端统计](#111-参考仓库与开源实现的实测统计) | M3 | 模块、类清单、测试、PSS |
| [§11.4 已知坑 28–37](#114-已知坑与不兼容点) | 综合 | 新增 10 条坑 |
| [§11.6 参考链接](#116-参考链接) / [§11.7 文件索引](#117-与本文档对应的实测文件索引) | 综合 | 7 个新仓库 + 23 个可查文件 |

### 12.1 v1.1 二次合并（子代理深读报告）

以下为 M3 / DV 深读子代理报告回来后补充的条目，其中数条**修正了 v1.1 初版的说法**：

| 章节 | 修正/新增 | 内容 |
| --- | --- | --- |
| §3.1 | **新增** | 顶层 `jarCache` 键（唯一真正新增的顶层键） |
| §3.1 | **修正** | M3 **不读** `headers`/`logo`/`notice`/`assrt`/`ijk`/`epg`/`msg`；`ijk` 软硬解是内置两组 option |
| §3.3 | **补充** | `site.timeout` 钳制 5~60（默认 15）；`site.style` 控制网格列数 |
| §4.3.3.1 | **补充** | `SuperParse` 完整链路：多 `<iframe>` 并发解析，谁先嗅到谁赢；flag = `parseFlag+"123"` |
| §5.7 | **修正** | `site.click` 后半段是**任意 JS**，M3 已把自动补 `.click()` 那行**注释掉** |
| §5.7 | **补充** | 嗅探**只取第一个候选**，总超时 20s；多画质 = `url` 为偶数长度 JSON 数组 |
| §5.8.3 | **新增** | 外部播放器 `pl` 编码表（MX/Reex/Kodi/附近TVBox/VLC）与各自的 headers 传递方式；`pr` 0/1；EXO 字幕延迟用动态代理拦 `render(positionUs)` |
| §5.12.1 | **修正** | 🐞 `.ttml` 被分派到 `FormatSTL`（bug），`FormatSCC`/`FormatTTML` 存在但未使用；`assrt` 配置键不存在 |
| §5.12.2 | **补充** | 弹幕源三种形态（占位符 / `/danmaku` 后缀 / base URL）+ 集号降级重搜 |
| §5.13.4 | **修正** | `SocketHttpStreamServer` **不是媒体服务器**，只服务 UPnP 事件订阅；端口动态（Cling 默认 49152） |
| §5.13.5 | **新增** | 「附近 TVBox」是 HTTP 扫描而非 DLNA：扫 C 段 1–255 的 `9978/action`，响应体恰为 `"ok"`；`/action` 的 `do=` 五值 |
| §7.1.1 | **修正** | QuickJS 运行时实为 `wang.harlon.quickjs:wrapper-android:2.1.0`（非 caoccao 原版直连） |
| §7.1.2 | **新增** | **M3 的 `net.js` 只有 `req`/`http`**；`net.json/get/post/batch/...` 属 FongMi 引擎与 drpy2 约定 |
| §7.1.3 | **新增** | JS 源三种入口契约；`//bb`/`//DRPY` 字节码 `BYTECODE_VERSION=67`；单一 Executor 串行化 |
| §7.1.4 | **新增** | `proxy` 按 `from=catvod` 分流成 `proxy1`(5 元数组) / `proxy2`(对象) |
| §7.13.9 | **新增** | **Chaquopy 桥接层**：`Python.start(AndroidPlatform)`、`getModule("app")`、`init` 六步与 30s 超时、`localProxy` 5 元契约、**`http://127.0.0.1:UndCover/proxy` 占位符**、`java`/`python` 双风味族 |

### 12.2 v1.2 三次合并（DolbyVision 深读报告）

DolbyVision 深读子代理报告回来后补充，其中数条**再次修正**：

| 章节 | 修正/新增 | 内容 |
| --- | --- | --- |
| §3.1 | **再修正** | DV 版不读的顶层键进一步扩大：`headers`/`proxy`/`logo`/`notice`/`assrt`/`danmaku`/`ijk`/根级 `epg`/`urls`/`msg`/`videoTypes`/`liveSettings`/`gridview` **全不读** |
| §3.3 | **再修正** | DV 版 `SourceBean` 字段收窄：`lang`/`hide`/`indexs`/`changeable`/`danmaku`/`header`/`timeout` **全部无解析代码**；`playerType` 解析了但全局无消费者 |
| §5.8.1.0 | **新增** | **DV 版没有 IJK**：单一 ExoPlayer 2.19.1 + MediaCodec 硬解 + 强制 PCM16 双声道；`updateCfg` 强制把所有内置值改回 `0`；只有 SurfaceView |
| §6.1 | **修正** | `lives[].type` **确实被 `ApiConfig` 读**（`"0"` txt 代理 / `"3"` 爬虫直播）——与「`Live` bean 无 type」是两个层次；并给出 Base64 + `?do=live&type=txt&ext=` 的完整拼法 |
| §7.13.6 | **修正** | **DV 版没有 `/cache` 路由** → py 源的 `getCache/setCache/delCache` 会拿到 HTML |
| §7.13.8.1 | **新增** | 插件目录按分支而变（M3 `<cache>/py` vs DV **`/storage/emulated/0/plugin/`** 硬编码 + 需存储权限）；DV 的 `extend=` **不 URL 编码**；Chaquopy 12.0.1 / Python 3.12 / 8 个 pip 包 |
| §7.13.7 | **修正** | `runner.py`/`trigger.py` 在 DV 版是**死代码**（无 Java 引用），HTTPS→Java 兜底是 **M3 特有** |
| §8.2.1 | **新增** | DV 版路由全集与缺失项（无 `/cache`/`/parse`/`/image`/`/media`/`/tvbus`/`/device`）；`/action` 只剩 `search`/`api`/`push`；`push` 的 URL 用 `\|` 接头 |
| §8.9 | **新增** | **Room 数据库 schema**：`tvbox.v3.db` 三表；播放进度写 `cache` 表，key = `md5("<sourceKey>\|<vodId>\|<flag>\|<index>")`；Gson 排除 `seriesFlags`/`seriesMap` |
| §8.10 | **新增** | **`X-TVBox-Probe-*` 内部探针头**（9 个）与 URL 内联头 `@Headers=` / `@User-Agent=`（分隔符 `@`） |
