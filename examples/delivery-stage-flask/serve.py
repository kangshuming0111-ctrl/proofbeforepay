from pathlib import Path
import argparse, json, secrets, sys
from werkzeug.serving import make_server
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--database',required=True);p.add_argument('--init',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parent
sys.path.insert(0,str(Path(a.source).resolve()/'examples/tutorial'))
from flaskr import create_app
app=create_app({'SECRET_KEY':secrets.token_hex(32),'DATABASE':str(Path(a.database).resolve())})
if a.init:
 from flaskr.db import init_db
 with app.app_context():init_db()
server=make_server('127.0.0.1',0,app)
print(json.dumps({'ready':True,'port':server.server_port}),flush=True)
server.serve_forever()
