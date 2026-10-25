import argparse
import json

from .dataset import import_records, load_records, local_path
from .evaluation import compare


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    ingest = commands.add_parser('import')
    ingest.add_argument('--input', required=True)
    ingest.add_argument('--store', required=True)
    evaluate = commands.add_parser('evaluate')
    evaluate.add_argument('--store', required=True)
    evaluate.add_argument('--train-end', required=True)
    evaluate.add_argument('--calibration-end', required=True)
    evaluate.add_argument('--test-end', required=True)
    evaluate.add_argument('--out', required=True)
    evaluate.add_argument('--model-version')
    args = parser.parse_args()
    if args.command == 'import':
        with open(local_path(args.input), encoding='utf-8') as stream:
            result = {'inserted': import_records(args.store, json.load(stream))}
    else:
        result = compare(load_records(args.store), args.train_end, args.calibration_end, args.test_end, model_version=args.model_version)
        output = local_path(args.out)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('x', encoding='utf-8') as stream:
            json.dump(result, stream, indent=2, ensure_ascii=False, allow_nan=False)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    main()
