import argparse
import json
import sys

from .artifacts import load_model, read_json, save_model, write_json
from .dataset import import_records, load_records, local_path
from .evaluation import compare
from .inference import predict_batch


def add_periods(parser):
    parser.add_argument('--train-end', required=True)
    parser.add_argument('--calibration-end', required=True)
    parser.add_argument('--test-end', required=True)
    parser.add_argument('--model-version')


def train_to_directory(payload, args):
    from .training import train

    destination = local_path(args.out_dir)
    if destination.exists():
        raise FileExistsError('output directory already exists; choose a new run directory')
    model, report = train(payload, args.train_end, args.calibration_end, args.test_end,
                          model_version=args.model_version, provenance=args.provenance)
    destination.mkdir(parents=True, exist_ok=False)
    write_json(destination / 'report.json', report)
    if model is not None:
        save_model(destination / 'model.json', model)
    return {'status': report['status'], 'usage': report['usage'], 'output': str(destination),
            'model_id': model.model_id if model is not None else None,
            'reason': report['reason'], 'split_counts': report['split_counts']}, model is not None


def run_demo(args):
    from .demo import BOUNDARIES, generate
    from .training import train

    destination = local_path(args.out_dir)
    if destination.exists():
        raise FileExistsError('output directory already exists; choose a new run directory')
    payload, requests = generate(args.seed)
    model, report = train(payload, *BOUNDARIES, provenance='synthetic')
    if model is None:
        raise ValueError('demo did not contain enough labeled episodes')
    destination.mkdir(parents=True, exist_ok=False)
    write_json(destination / 'dataset.json', payload)
    write_json(destination / 'requests.json', requests)
    save_model(destination / 'model.json', model)
    write_json(destination / 'report.json', report)
    predictions = predict_batch(load_model(destination / 'model.json'), requests['observations'])
    write_json(destination / 'predictions.json', predictions)
    return {'status': 'demonstration_complete', 'usage': 'demonstration_only', 'seed': args.seed,
            'output': str(destination), 'model_id': model.model_id,
            'split_counts': report['split_counts'], 'predictions': len(predictions['predictions']),
            'metrics_are_real_world_evidence': False}


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    ingest = commands.add_parser('import')
    ingest.add_argument('--input', required=True)
    ingest.add_argument('--store', required=True)
    evaluate = commands.add_parser('evaluate')
    evaluate.add_argument('--store', required=True)
    add_periods(evaluate)
    evaluate.add_argument('--out', required=True)
    training = commands.add_parser('train')
    source = training.add_mutually_exclusive_group(required=True)
    source.add_argument('--store')
    source.add_argument('--input')
    add_periods(training)
    training.add_argument('--out-dir', required=True)
    training.add_argument('--provenance', choices=('real', 'synthetic'), default='real')
    predict = commands.add_parser('predict')
    predict.add_argument('--model', required=True)
    predict.add_argument('--input', required=True)
    predict.add_argument('--out', required=True)
    demo = commands.add_parser('demo')
    demo.add_argument('--out-dir', required=True)
    demo.add_argument('--seed', type=int, default=42)
    commands.add_parser('serve')
    args = parser.parse_args()
    status = 0
    try:
        if args.command == 'serve':
            from .server import serve

            serve()
            return 0
        elif args.command == 'import':
            result = {'inserted': import_records(args.store, read_json(args.input))}
        elif args.command == 'evaluate':
            result = compare(load_records(args.store), args.train_end, args.calibration_end, args.test_end,
                             model_version=args.model_version)
            write_json(args.out, result)
        elif args.command == 'train':
            payload = load_records(args.store) if args.store else read_json(args.input)
            result, trained = train_to_directory(payload, args)
            status = 0 if trained else 2
        elif args.command == 'predict':
            payload = read_json(args.input)
            observations = payload.get('observations') if isinstance(payload, dict) else payload
            predictions = predict_batch(load_model(args.model), observations)
            write_json(args.out, predictions)
            result = {'status': 'predicted', 'usage': predictions['usage'], 'output': str(local_path(args.out)),
                      'model_id': predictions['model_id'], 'payments': len(predictions['predictions'])}
        else:
            result = run_demo(args)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'status': 'error', 'message': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    return status


if __name__ == '__main__':
    sys.exit(main())
