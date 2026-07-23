"""ForgeControl restricted Python script worker for FUXA."""
import ast
import json
import sys
import traceback

FORBIDDEN_NODES = (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)
FORBIDDEN_NAMES = {"eval", "exec", "open", "compile", "__import__", "input", "breakpoint"}


class Result:
    def __init__(self):
        self.logs = []
        self.writes = []


class Tags:
    def __init__(self, values, result):
        self.values = values
        self.result = result

    def read(self, tag_id):
        if tag_id not in self.values:
            raise KeyError(f"Tag does not exist: {tag_id}")
        return self.values[tag_id]

    def write(self, tag_id, value):
        if tag_id not in self.values:
            raise KeyError(f"Tag does not exist: {tag_id}")
        self.values[tag_id] = value
        self.result.writes.append({"tagId": tag_id, "value": value})


class Logger:
    def __init__(self, result):
        self.result = result

    def _add(self, level, message):
        self.result.logs.append({"level": level, "message": str(message)})

    def info(self, message):
        self._add("info", message)

    def warning(self, message):
        self._add("warning", message)

    def error(self, message):
        self._add("error", message)


def validate(source):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, FORBIDDEN_NODES):
            raise ValueError(f"Forbidden Python syntax: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise ValueError(f"Forbidden Python capability: {node.id}")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError("Double-underscore attribute access is forbidden")
    return tree


def execute(payload):
    tree = validate(payload.get("code", ""))
    result = Result()
    safe_builtins = {
        "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
        "enumerate": enumerate, "float": float, "int": int, "len": len,
        "list": list, "max": max, "min": min, "range": range, "round": round,
        "str": str, "sum": sum, "tuple": tuple, "zip": zip,
        "Exception": Exception, "ValueError": ValueError
    }
    scope = {
        "__builtins__": safe_builtins,
        "tags": Tags(payload.get("tags", {}), result),
        "logger": Logger(result)
    }
    exec(compile(tree, "<fuxa-python-script>", "exec"), scope, scope)
    main = scope.get("main")
    if not callable(main):
        raise ValueError("Python script must define main(event)")
    value = main(payload.get("event", {}))
    return {
        "ok": True,
        "value": value,
        "logs": result.logs,
        "writes": result.writes
    }


try:
    request = json.load(sys.stdin)
    print(json.dumps(execute(request), ensure_ascii=False))
except Exception as exc:
    print(json.dumps({
        "ok": False,
        "error": str(exc),
        "trace": traceback.format_exc(limit=4)
    }, ensure_ascii=False))
