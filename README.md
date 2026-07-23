# ForgeControl 工业组态与 SCADA 系统

ForgeControl 是基于开源项目 [FUXA](https://github.com/frangoteam/FUXA) 扩展开发的 Web 工控软件系统，面向工业自动化、设备监控、数据采集、HMI 组态和运行时可视化。

系统分为两个主要状态：

- **开发时**：设备与变量配置、画面设计、控件配置、全局脚本、AI 辅助编程和项目设置。
- **运行时**：实时数据显示、按钮与控件动作、脚本执行、报警监控和运行日志。

> 当前项目仍遵循原 FUXA 的 MIT 开源许可证。使用、修改和发布时请保留原项目版权及许可证说明。

## 主要功能

- 基于浏览器的 SCADA/HMI 图形组态编辑器
- SVG 工业画面和可复用控件
- 实时变量、历史数据、报警和通知
- JavaScript 全局脚本、画面脚本和控件脚本
- Python 服务端脚本
- AI 辅助生成 JavaScript/Python 脚本
- OpenAI 兼容模型接口配置
- Excel 变量批量导入
- 设备连接与驱动管理
- 运行时动作与脚本实时日志
- 用户、角色和访问控制

## 支持的工业协议

项目继承并保留 FUXA 的工业通信能力，当前重点支持：

- Siemens S7
- Modbus TCP
- Modbus RTU

同时保留 OPC UA、MQTT、BACnet/IP、EtherNet/IP、ADS、MELSEC、ODBC、Redis 等原有驱动能力。

## 本项目相对 FUXA 的主要修改

### 1. 中文开发环境

- 开发环境默认语言改为简体中文。
- 保留英文和其他已有语言切换能力。
- 新增功能已补充中文界面文字。

### 2. Excel 变量导入

- 在变量管理中增加 Excel 文件导入。
- 仅支持 Excel 工作簿格式，不提供 CSV 和 TSV 导入。
- 支持导入前解析、字段映射、数据校验和错误提示。
- 用于减少大量 PLC/设备变量的重复手工录入。

### 3. 驱动与连接管理

- 强化设备连接和驱动管理入口。
- 当前重点覆盖 Siemens S7、Modbus TCP 和 Modbus RTU。
- 变量仍与对应设备、驱动地址和数据类型关联。

### 4. Python 脚本支持

- Python 脚本与原有 JavaScript 脚本并存。
- Python 脚本可以在全局脚本、画面和控件相关开发流程中使用。
- Python 代码通过独立工作进程执行。
- 当前提供受限的变量读写和日志接口。
- 禁止任意导入、文件访问、网络访问、子进程、`eval` 和 `exec`。

### 5. AI 脚本编写

- JavaScript 和 Python 编辑器均支持 AI 辅助编写。
- 支持在系统设置中配置 OpenAI 兼容接口：
  - API 地址
  - 模型名称
  - API Key
- AI 会接收当前项目中的变量、画面、控件和脚本上下文。
- AI 输出会过滤思考过程、Markdown 包装和非代码文字。
- AI 只能使用平台已经注册的系统函数白名单。
- 如果生成不存在的 `$函数()`，服务端会拒绝结果并返回明确错误。

完整规则请查看：

- [AI 脚本生成规则](docs/AI脚本生成规则.md)
- [脚本配置说明](docs/HowTo-configure-Script.md)

### 6. 新增 UI 脚本接口

新增并注册以下运行画面接口：

```javascript
$setViewBackground(cssColor)
$setControlBackground(controlNameOrId, cssColor)
```

示例：

```javascript
$setViewBackground('#00FF00');
$setControlBackground('button_1', '#00FF00');
```

控件背景接口支持使用控件名称或内部控件 ID。

### 7. 运行时脚本日志

- 运行界面增加“脚本日志”按钮。
- 日志窗口显示在运行画面下方。
- 实时记录：
  - 脚本开始和结束
  - 系统函数调用
  - 服务端 UI 命令发送
  - 浏览器命令接收
  - 控件或画面操作结果
  - 错误原因
- 日志支持清空、关闭和未读数量提示。

### 8. 脚本执行问题修复

- 修复服务端缺少 `SCRIPT_COMMAND` 事件导致 UI 命令无法到达浏览器的问题。
- 修复普通运行脚本异常被静默吞掉的问题。
- 修复具体运行画面路由中日志按钮不显示的问题。
- 增加控件名称到内部控件 ID 的查找和回退机制。

## AI JavaScript 常用接口

### 变量操作

```javascript
const value = await $getTag('变量ID');
$setTag('变量ID', value);
const tagId = $getTagId('变量名称', '设备名称');
```

### 画面和控件

```javascript
$setView('画面名称');
$setViewBackground('#808080');
$setControlBackground('控件名称', '#00FF00');
```

### 历史数据与报警

```javascript
const history = await $getHistoricalTags(
    ['变量ID'],
    Date.now() - 3600000,
    Date.now()
);

const alarms = await $getAlarms();
```

请勿使用未在 [AI 脚本生成规则](docs/AI脚本生成规则.md) 中列出的 `$函数()`。

## Python 脚本示例

```python
def main(event):
    value = tags.read("t_temperature")
    logger.info(value)
    if value > 80:
        tags.write("t_alarm", True)
```

## 源码运行

### 环境要求

- Node.js 18 LTS 或兼容版本
- npm
- Python 3（使用 Python 脚本功能时）

### 安装服务端依赖

```bash
cd server
npm install
```

### 安装并构建客户端

```bash
cd client
npm install
npm run build
```

### 启动系统

```bash
cd server
npm start
```

浏览器访问：

```text
http://localhost:1881
```

## 开发模式

启动 Angular 客户端：

```bash
cd client
npm start
```

启动服务端：

```bash
cd server
npm start
```

## 测试

服务端自动化测试：

```bash
cd server
npm test
```

客户端构建检查：

```bash
cd client
npm run build
```

## 项目文档

- [ForgeControl 扩展架构](docs/forgecontrol-extensions.md)
- [AI 脚本生成规则](docs/AI脚本生成规则.md)
- [脚本配置说明](docs/HowTo-configure-Script.md)
- [原 FUXA 文档](https://frangoteam.github.io/FUXA/)

## 上游项目

本项目基于：

- FUXA 仓库：[frangoteam/FUXA](https://github.com/frangoteam/FUXA)
- FUXA 官方文档：[frangoteam.github.io/FUXA](https://frangoteam.github.io/FUXA/)

感谢 FUXA 原作者和社区贡献者提供的开源基础。

## 许可证

本项目沿用 [MIT License](LICENSE)。二次发布时必须遵守许可证要求并保留原始版权声明。
