import json

from .dataset import local_path
from .model import LogisticModel


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def invalid_constant(value):
    raise ValueError('non-finite JSON number')


def read_json(path, max_bytes=100_000_000):
    source = local_path(path)
    with source.open('rb') as stream:
        body = stream.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise ValueError('JSON file exceeds size limit')
    return json.loads(body, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def write_json(path, data):
    body = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    destination = local_path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x', encoding='utf-8') as stream:
        stream.write(body)
    return destination


def save_model(path, model):
    return write_json(path, model.to_dict())


def load_model(path):
    return LogisticModel.from_dict(read_json(path, max_bytes=1_000_000))
