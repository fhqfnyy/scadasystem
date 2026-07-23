# ForgeControl 扩展说明

ForgeControl 基于 FUXA 增加中文开发环境、Excel 变量导入、Python 脚本、AI 辅助编程、OpenAI 兼容模型设置、运行时脚本日志和 UI 控制接口。

开发环境默认使用简体中文（`zh-cn`），同时保留英文及其他语言切换能力。

Python 脚本与原有 JavaScript 脚本并存，并在独立工作进程中受限执行。AI 生成的代码只作为编辑候选，保存前应进行测试；系统还会按照运行模式校验 JavaScript 系统函数白名单，阻止不存在的 `$函数()` 进入编辑器。

主要修改内容：

- Excel 变量批量导入；
- Siemens S7、Modbus TCP、Modbus RTU 驱动管理；
- JavaScript 和 Python AI 脚本编写；
- OpenAI 兼容模型参数配置；
- AI 输出清理和系统函数白名单；
- `$setViewBackground()` 和 `$setControlBackground()`；
- 运行画面实时脚本与动作日志；
- 脚本命令事件、异常追踪和控件名称解析修复。

详细内容请查看：

- [中文项目说明](README.md)
- [扩展架构](docs/forgecontrol-extensions.md)
- [AI 脚本生成规则](docs/AI脚本生成规则.md)
