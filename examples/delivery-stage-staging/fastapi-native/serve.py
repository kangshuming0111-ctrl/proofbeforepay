import importlib.util
import json
from pathlib import Path
import socket
import sys
import uvicorn

source = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('pbp_official_fastapi_tutorial', source)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
listener.bind(('127.0.0.1', 0))
listener.listen(128)
print(json.dumps({'port': listener.getsockname()[1]}), flush=True)
uvicorn.Server(uvicorn.Config(module.app, host='127.0.0.1', log_level='critical', access_log=False)).run(sockets=[listener])
