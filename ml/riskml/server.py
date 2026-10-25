import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore

from .artifacts import invalid_constant, unique_object
from .runtime import ModelRuntime


def handler_for(runtime):
    slots = BoundedSemaphore(8)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *args):
            pass

        def respond(self, code, value):
            body = json.dumps(value, allow_nan=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ('/health', '/status'):
                self.respond(200, runtime.status())
            else:
                self.respond(404, {'error': 'not_found'})

        def do_POST(self):
            if not slots.acquire(blocking=False):
                self.respond(503, {'error': 'busy'})
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size <= 0 or size > 10_000_000:
                    self.respond(413, {'error': 'body_size'})
                    return
                body = json.loads(self.rfile.read(size), object_pairs_hook=unique_object,
                                  parse_constant=invalid_constant)
                if self.path == '/training-data':
                    self.respond(202, runtime.submit(body))
                elif self.path == '/predict':
                    self.respond(200, runtime.predict(body['observations']))
                else:
                    self.respond(404, {'error': 'not_found'})
            except KeyError:
                self.respond(422, {'error': 'missing_field'})
            except LookupError:
                self.respond(409, {'error': 'model_not_ready'})
            except (ValueError, TypeError):
                self.respond(422, {'error': 'invalid_input_or_incompatible_model'})
            except (OSError, TimeoutError):
                self.close_connection = True
            except Exception:
                self.respond(500, {'error': 'internal_error'})
            finally:
                slots.release()
    return Handler


def serve():
    runtime = ModelRuntime(os.getenv('ML_RUNTIME_DIR', 'reports/runtime'),
                           demo=os.getenv('ML_DEMO_ENABLED', 'false').lower() == 'true',
                           interval=int(os.getenv('ML_RETRAIN_SECONDS', '3600')))
    server = ThreadingHTTPServer(('0.0.0.0', int(os.getenv('ML_PORT', '8091'))), handler_for(runtime))
    runtime.start()
    try:
        server.serve_forever()
    finally:
        server.server_close()
        runtime.close()
