# ForgeControl AI 脚本生成规则

## 1. 目的

本规则用于约束 ForgeControl/FUXA 中的 AI 脚本生成功能，确保 AI 只使用系统已经实现并注册的接口，避免生成看似正确但无法执行的代码。

AI 必须根据脚本语言和运行模式选择对应的接口白名单。任何未列出的 `$函数()` 都不属于当前系统接口。

## 2. 通用生成规则

1. 只返回源代码，不得返回 Markdown 代码块、解释文字、思考过程或函数外包装。
2. JavaScript 编辑器只需要函数体，不得再次声明外层函数。
3. 必须使用项目上下文中真实存在的变量 ID、控件名称/ID、画面名称和脚本名称。
4. 不得自行虚构 `$函数()`。
5. 无法使用现有接口完成需求时，应返回 JavaScript 注释说明缺少的能力，不得伪造接口。
6. 查询、读取、配置、历史数据和消息类异步接口应使用 `await`。
7. 禁止使用 `require`、`import`、文件访问、网络访问、子进程、`eval` 和 `Function`。
8. 不得通过普通脚本实现急停、安全联锁或其他安全功能。
9. 修改现有脚本时，应尽量保留原有有效逻辑。

## 3. JavaScript 服务端脚本白名单

服务端脚本可以使用以下系统函数：

### 3.1 变量操作

```javascript
$getTag(tagId)
$setTag(tagId, value)
$getTagId(tagName, deviceName?)
```

示例：

```javascript
const temperature = await $getTag('t_temperature');
$setTag('t_alarm', temperature > 80);
```

### 3.2 变量采集配置

```javascript
$getTagDaqSettings(tagId)
$setTagDaqSettings(tagId, settings)
```

### 3.3 画面和控件操作

```javascript
$setView(viewName, force?)
$setViewBackground(cssColor)
$setControlBackground(controlNameOrId, cssColor)
```

修改当前运行画面背景：

```javascript
$setViewBackground('#808080');
```

修改指定按钮或控件背景：

```javascript
$setControlBackground('button_1', '#00FF00');
```

`controlNameOrId` 必须是项目中真实存在的控件名称或控件 ID。

### 3.4 设备操作

```javascript
$enableDevice(deviceName, enabled)
$getDevice(deviceName)
$getDeviceProperty(deviceName)
$setDeviceProperty(deviceName, property)
```

### 3.5 历史数据

```javascript
$getHistoricalTags(tagIds, fromTimestamp, toTimestamp)
```

示例：

```javascript
const values = await $getHistoricalTags(
    ['t_temperature'],
    Date.now() - 3600000,
    Date.now()
);
```

### 3.6 消息与报警

```javascript
$sendMessage(to, subject, message)
$getAlarms()
$getAlarmsHistory(fromDate, toDate)
$ackAlarm(alarmName, types?)
```

## 4. JavaScript 客户端脚本白名单

客户端脚本支持以下通用函数：

```javascript
$getTag(tagId)
$setTag(tagId, value)
$getTagId(tagName, deviceName?)
$getTagDaqSettings(tagId)
$setTagDaqSettings(tagId, settings)
$setView(viewName, force?)
$setViewBackground(cssColor)
$setControlBackground(controlNameOrId, cssColor)
$openCard(viewName, options?)
$enableDevice(deviceName, enabled)
$getDeviceProperty(deviceName)
$setDeviceProperty(deviceName, property)
$getHistoricalTags(tagIds, fromTimestamp, toTimestamp)
$sendMessage(to, subject, message)
$getAlarms()
$getAlarmsHistory(fromDate, toDate)
$ackAlarm(alarmName, types?)
```

客户端还支持以下专用函数：

```javascript
$setAdapterToDevice(adapterName, deviceName)
$resolveAdapterTagId(tagId)
$invokeObject(controlName, methodName, ...params)
$getObject(controlName)
$runServerScript(scriptName, ...params)
```

服务端脚本不得使用这些客户端专用函数。

## 5. Python 脚本规则

Python 脚本必须定义：

```python
def main(event):
    pass
```

当前允许的接口：

```python
tags.read(tag_id)
tags.write(tag_id, value)
logger.info(message)
logger.warning(message)
logger.error(message)
```

示例：

```python
def main(event):
    value = tags.read("t_temperature")
    logger.info(value)
    if value > 80:
        tags.write("t_alarm", True)
```

Python 脚本禁止导入模块、访问文件、访问网络、启动子进程以及使用 `eval` 或 `exec`。

## 6. 画面与脚本执行环境

### 6.1 服务端脚本

服务端脚本在 FUXA 服务进程中运行。涉及 UI 的函数会通过 `script-command` 事件把动作发送到已经打开的运行界面。

例如：

```javascript
$setViewBackground('#00FF00');
```

该命令只有在浏览器中存在运行画面时才能修改画面背景。在 `/scripts` 脚本编辑页面执行测试时，没有运行画面对象可供修改。

### 6.2 客户端脚本

客户端脚本直接在浏览器运行，可以访问当前运行画面的已注册控件对象，但仍然只能使用白名单中的系统函数。

## 7. AI 项目上下文

生成 JavaScript 时，系统应向 AI 提供以下项目上下文：

- 变量 ID、变量名称、数据类型和所属设备；
- 画面名称和画面 ID；
- 控件名称、控件 ID、控件类型和所属画面；
- 已有脚本名称、语言和运行模式；
- 当前脚本参数；
- 当前脚本源代码；
- 用户提出的功能需求。

AI 必须优先使用上下文中提供的精确名称和 ID。

## 8. 生成结果校验

系统使用以下形式识别 JavaScript 中的系统函数调用：

```text
$函数名(...)
```

生成结果中的每个 `$函数名` 都必须属于当前运行模式的白名单。

如果检测到不存在的接口，例如：

```javascript
$setControlText('button_1', '运行中');
```

系统应拒绝该生成结果，并返回：

```text
AI generated unsupported system functions: $setControlText
```

无效代码不得覆盖编辑器中的原代码。

## 9. 常见需求的正确写法

### 修改整个画面背景

```javascript
$setViewBackground('#00FF00');
```

### 修改多个按钮背景

```javascript
$setControlBackground('变灰', '#00FF00');
$setControlBackground('变绿', '#00FF00');
$setControlBackground('button_1', '#00FF00');
```

### 写入变量

```javascript
$setTag('t_584e981a-98e346b4', 65280);
```

写变量只会改变变量值。只有控件已经绑定该变量并配置相应的颜色规则时，写变量才会间接改变控件颜色。

### 读取变量后进行判断

```javascript
const value = await $getTag('t_temperature');
if (value > 80) {
    $setTag('t_alarm', true);
}
```

## 10. 新增系统函数的要求

如果后期需要增加新的 `$函数()`，至少应完成：

1. 定义函数名称、参数和适用运行模式；
2. 在服务端或客户端脚本运行器中注册；
3. 涉及 UI 时增加命令协议和浏览器端处理；
4. 增加参数校验、目标查找、错误日志和执行日志；
5. 将函数加入对应模式的 AI 白名单；
6. 更新本操作说明；
7. 增加自动化测试；
8. 重新编译客户端或重启服务端，使新接口生效。

新增接口注册一次后，普通用户脚本可以重复使用，不需要每次执行时重新注册。
