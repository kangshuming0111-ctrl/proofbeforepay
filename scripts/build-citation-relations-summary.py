"""Publish labelled evidence copies without rewriting original model artifacts."""
import hashlib
import json
import pathlib
import re
import shutil
import stat

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/citation-relations-2026-11-05'
PUBLIC = ROOT / 'public/benchmarks/citation-relations-2026-11-05'
PUBLIC.mkdir(parents=True, exist_ok=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(name):
    return json.loads((OUT / name).read_text())


def write_public(name, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    (PUBLIC / name).write_bytes(data)
    return digest(data)


copy_metadata = {}
pending_artifacts = []


def exact_copy(name):
    original = (OUT / name).read_bytes()
    shutil.copyfile(OUT / name, PUBLIC / name)
    assert (PUBLIC / name).read_bytes() == original
    copy_metadata[name] = {'copyKind': 'exact copy of retained artifact', 'originalArtifactSha256': digest(original),
                           'publicSha256': digest(original), 'sanitizedMetadataFields': []}


def counts(data):
    rows = data['results']
    criteria = [item for row in rows for item in row['criteria']]
    return {'projects': len(rows), 'criteria': len(criteria),
            'rawAgreement': sum(item['rawStatus'] == item['referenceStatus'] for item in criteria),
            'applicationAgreement': sum(item['applicationStatus'] == item['referenceStatus'] for item in criteria),
            'admittedReports': sum(row['application']['accepted'] for row in rows),
            'completeItemProjects': sum(row['rawDiagnostics']['completeItemCoverage'] for row in rows)}


reports = ['cycle-11-pilot-live.json', 'cycle-12-scope-live.json', 'cycle-13-new-first-live.json',
           'cycle-13-known-live.json', 'cycle-13-scope-live.json', 'cycle-14-repair-new-live.json',
           'cycle-14-known-live.json', 'cycle-14-scope-live.json', 'cycle-15-repair-new-live.json',
           'cycle-15-known-live.json', 'cycle-15-scope-live.json']
data = {name: read(name) for name in reports}
for name in reports:
    exact_copy(name)
    exact_copy(name.replace('-live.json', '-freeze.json'))

review_names = {'known': 'r15-known-independent-whole-answer-review.json',
                'repairNew': 'r15-new-independent-whole-answer-review.json',
                'scope': 'r15-scope-independent-whole-answer-review.json'}
for name in ['cycle-14-post-deepseek.json', 'cycle-14-adjudication.json', 'cycle-15-plan-deepseek.json',
             'cycle-15-post-deepseek.json', 'cycle-15-adjudication.json', *review_names.values(), 'final-checks.json']:
    if not (OUT / name).is_file() and name == 'cycle-15-adjudication.json':
        pending_artifacts.append(name)
        continue
    exact_copy(name)

replay_name = 'final-publication-replay.json'
original_replay_bytes = (OUT / replay_name).read_bytes()
replay = json.loads(original_replay_bytes)
assert replay['mode'] == 'controlled_application_replay'
assert replay['apiCalls'] == replay['networkCalls'] == replay['modelCalls'] == 0
public_replay = json.loads(original_replay_bytes)
redacted_fields = []
corpus_public = {'known': 'known-corpus.json', 'repair-new': 'project-assessment-corpus-citation-relations-holdout.json',
                 'scope': 'citation-relations-scope-corpus-2026-11-05.json'}
for index, source in enumerate(public_replay['inputs']):
    for key in ['corpus', 'live', 'freeze']:
        assert pathlib.Path(source[key]).is_absolute()
        target = corpus_public[source['group']] if key == 'corpus' else pathlib.Path(source[key]).name
        assert (PUBLIC / target).is_file()
        expected = source['corpusSha256'] if key == 'corpus' else source['liveSha256'] if key == 'live' else source['freezeFileSha256']
        assert digest((PUBLIC / target).read_bytes()) == expected
        source[key] = target
        redacted_fields.append(f'inputs[{index}].{key}')
assert len(redacted_fields) == 9
public_replay['publicationCopy'] = {
    'kind': 'explicit sanitized public copy', 'originalArtifactSha256': digest(original_replay_bytes),
    'sanitizedMetadataFields': redacted_fields,
    'note': 'Only nine absolute input-file metadata paths were replaced with public artifact filenames. Original requests, responses, source hashes, old/current reports and statuses are unchanged. Original retained artifact hash is above.'}
public_replay_sha = write_public(replay_name, public_replay)
copy_metadata[replay_name] = {'copyKind': 'explicit sanitized public copy', 'originalArtifactSha256': digest(original_replay_bytes),
                              'publicSha256': public_replay_sha, 'sanitizedMetadataFields': redacted_fields}

for name in ['final-publication-replay-review.json', 'publication-replay-wx-control.json']:
    original = (OUT / name).read_bytes()
    value = json.loads(original)
    # The review's inputSha256 intentionally continues identifying its original
    # retained input, never a claim that the sanitized public bytes are identical.
    value['publicationCopy'] = {'kind': 'public copy with explicit provenance note',
                                'originalArtifactSha256': digest(original), 'sanitizedMetadataFields': [],
                                'originalReplaySha256': digest(original_replay_bytes), 'sanitizedPublicReplaySha256': public_replay_sha,
                                'note': 'Any original inputSha256 identifies the retained original replay. The sanitized public replay has the separate hash above; no audit result or wx control was changed.'}
    copied_sha = write_public(name, value)
    copy_metadata[name] = {'copyKind': 'public copy with explicit provenance note', 'originalArtifactSha256': digest(original),
                           'publicSha256': copied_sha, 'sanitizedMetadataFields': []}

# Exact current runtime import closure plus the independently hashed replay
# harness. This JSON archive preserves decoded source bytes, like R13-R15's
# existing archives; it does not turn into a generic binary allowance.
implementations = replay['currentImplementations']
assert implementations and all(group['currentImplementation'] == implementations[0]['currentImplementation'] for group in implementations)
source_rows = {row['file']: row['sha256'] for row in implementations[0]['currentImplementation']}
source_rows[replay['harness']['file']] = replay['harness']['sha256']
archive_files = []
for relative, expected in sorted(source_rows.items()):
    parts = pathlib.PurePosixPath(relative).parts
    assert not pathlib.PurePosixPath(relative).is_absolute() and '..' not in parts
    current = ROOT
    for part in parts:
        current = current / part
        assert not current.is_symlink()
    info = current.stat()
    assert stat.S_ISREG(info.st_mode)
    contents = current.read_bytes()
    assert digest(contents) == expected, f'Current runtime changed after publication replay: {relative}'
    text = contents.decode('utf-8', errors='strict')
    assert text.encode() == contents and '\0' not in text
    archive_files.append({'file': relative, 'sha256': expected, 'bytes': len(contents), 'encoding': 'utf8', 'contents': text})
archive = {'schema': 'pbp-exact-publication-implementation-v1', 'provenance': 'exact current publication runtime working-tree bytes at the retained zero-call replay',
           'originalR15SourceArchivesUnchanged': True, 'replayOriginalArtifactSha256': digest(original_replay_bytes),
           'runtimeClosureFiles': len(implementations[0]['currentImplementation']), 'replayHarness': replay['harness'],
           'currentRuntimeSnapshots': [{'group': group['group'], 'snapshotSha256': group['currentSnapshotSha256']} for group in implementations],
           'files': archive_files,
           'limits': ['Exact decoded source-byte SHA256 for the current runtime closure and replay harness, not a standalone full-repository/typecheck tree.',
                      'This publication-policy source is distinct from the original measured R15 implementation; replay made no new model call and all original requests/statuses were unchanged.']}
archive_name = 'publication-verified-implementation.json'
archive_sha = write_public(archive_name, archive)
assert all(digest(row['contents'].encode()) == row['sha256'] for row in json.loads((PUBLIC / archive_name).read_text())['files'])

final = [data[name] for name in reports if name.startswith('cycle-15-')]
raw_item = [citation for report in final for row in report['results'] for item in row['criteria'] for citation in item['rawCitations']]
raw_risk = [citation for report in final for row in report['results'] for risk in row['raw']['riskCitationChecks'] for citation in risk]
raw_citations = raw_item + raw_risk
published_item = [citation for row in replay['rows'] for item in row['currentApplication']['report']['items'] for citation in item['citations']]
published_risk = [citation for row in replay['rows'] for risk in row['currentApplication']['report']['risks'] for citation in risk['citations']]
assert len(raw_item) == 180 and len(raw_risk) == 63 and len(raw_citations) == 243
assert len(published_item) == 174 and len(published_risk) == 48
assert len(raw_citations) - len(published_item) - len(published_risk) == 21
assert all(row['itemStatusesUnchanged'] and row['quoteUnchanged'] and row['originalRequestSha256'] == row['replayRequestSha256'] for row in replay['rows'])

whole = {key: read(name) for key, name in review_names.items()}
artifacts = list(dict.fromkeys(['citation-relations-summary.json', *reports, *(name.replace('-live.json', '-freeze.json') for name in reports),
                              'r13-verified-implementation.json', 'r14-verified-implementation.json', 'r15-verified-implementation.json', archive_name,
                              'r13-source-freeze-reproduction.json', 'new-first-independent-whole-answer-review.json', *review_names.values(),
                              replay_name, 'final-publication-replay-review.json', 'publication-replay-wx-control.json', 'final-checks.json',
                              'cycle-14-post-deepseek.json', 'cycle-14-adjudication.json', 'cycle-15-plan-deepseek.json', 'cycle-15-post-deepseek.json',
                              'cycle-15-adjudication.json', 'source-provenance/provenance.json']))
summary = {
    'schema': 'pbp-citation-relations-validation-v1', 'phase': 'five evidence-driven cycles, 2026-11-05 to 2026-11-06 Melbourne',
    'newFirst': counts(data['cycle-13-new-first-live.json']), 'repairNew': counts(data['cycle-15-repair-new-live.json']),
    'previousKnown': counts(data['cycle-13-known-live.json']), 'knownFinal': counts(data['cycle-15-known-live.json']),
    'scopePrevious': counts(data['cycle-13-scope-live.json']), 'scopeFinal': counts(data['cycle-15-scope-live.json']), 'pilot': counts(data['cycle-11-pilot-live.json']),
    'assessmentCalls': sum(report['accounting']['calls'] for report in data.values()),
    'usageEstimateUsd': sum(report['accounting']['reportedUsageCostUsd'] for report in data.values()),
    'unknownUsageReservedUsd': sum(report['accounting']['unknownUsageReservedUsd'] for report in data.values()),
    'latestCitationChecks': {'count': len(raw_citations), 'valid': sum(citation['valid'] for citation in raw_citations),
                             'itemCount': len(raw_item), 'riskCount': len(raw_risk), 'evidenceLayer': 'retained original R15 answers; not current published risk count',
                             'originalJsonValid': sum(row['raw']['originalJsonValid'] is True for report in final for row in report['results']),
                             'reports': sum(len(report['results']) for report in final),
                             'allActualCatalogEncoding': all(row['raw']['citationEncoding'] == 'catalog_slots' for report in final for row in report['results'])},
    'currentPublishedCitationChecks': {'count': len(published_item) + len(published_risk), 'valid': len(published_item) + len(published_risk),
                                      'itemCount': len(published_item), 'riskCount': len(published_risk), 'evidenceLayer': 'controlled current publication-policy replay',
                                      'optionalRiskRowsWithheld': sum(len(row['originalApplication']['report']['risks']) - len(row['currentApplication']['report']['risks']) for row in replay['rows']),
                                      'riskQuotesWithheld': len(raw_risk) - len(published_risk),
                                      'itemQuotesConsolidatedByCanonicalMismatch': len(raw_item) - len(published_item),
                                      'totalQuoteDifference': len(raw_citations) - len(published_item) - len(published_risk)},
    'publicationReplay': {'artifact': replay_name, 'reviewArtifact': 'final-publication-replay-review.json', 'wxArtifact': 'publication-replay-wx-control.json',
                          'mode': replay['mode'], 'apiCalls': 0, 'networkCalls': 0, 'projects': replay['projects'], 'criteria': replay['criteria'],
                          'itemStatusesUnchanged': True, 'originalArtifactSha256': digest(original_replay_bytes), 'sanitizedPublicSha256': public_replay_sha,
                          'sanitizedMetadataFieldCount': len(redacted_fields), 'runtimeSourceArtifact': archive_name, 'runtimeSourceSha256': archive_sha,
                          'runtimeClosureFiles': archive['runtimeClosureFiles'], 'runtimeArchiveFilesIncludingHarness': len(archive_files)},
    'checks': read('final-checks.json'),
    'wholeAnswerReviews': {key: {'artifact': name, 'summary': whole[key].get('summary', {})} for key, name in review_names.items()},
    'artifactCopies': copy_metadata, 'artifacts': [name for name in artifacts if name not in pending_artifacts], 'pendingArtifacts': pending_artifacts,
    'limits': ['Public original templates and authored acceptance tasks, not real customer contracts or independent human tests.',
               'Two repositories were new to tracked tests; first results remain separate from later known repair runs. No model-training-data claim.',
               'Known seven tasks use six repositories; the longer Corona task does not add another repository.',
               'All exact citations are source provenance, not semantic/runtime correctness. Whole answers are reviewed by AI, not humans.',
               'Original R15 answers retain243 quotes (180 item,63 risk). Current controlled publication has222 (174 item,48 risk). Canonical mismatch witnesses consolidate six item quotes; six optional risks with15 risk quotes are temporarily withheld, not proven false or resolved.',
               'The publication-policy replay makes zero new API/model calls, preserves all82 statuses and exact original request bytes, and retains both old/current reports.',
               'Only nine absolute input-path metadata fields are sanitized in the public replay. Original SHA and explicit copy notes distinguish it from the ignored original.',
               'Conservative unknown retains unconfirmed file-role mapping and incomplete source witnesses; unknown is not a proven delivery defect.',
               'MainNav label text can fit within370 original units per page, but the current catalog candidates split those witnesses; six slots are not intrinsically insufficient.',
               'Schema/risk bounds still fail closed before optional-risk publication decisions, without trimming or automatic retry.',
               'No third-party browser/backend execution, human acceptance or payment is established by source batches.',
               'Usage estimates use frozen stated rates, not invoices. Hosted UI smoke is separate from retained model-call totals.']}
for name in summary['artifacts'][1:]:
    assert (PUBLIC / name).is_file(), f'Missing public artifact: {name}'
write_public('citation-relations-summary.json', summary)

# Independent public text scan, including decoded runtime contents. Generic
# source paths such as /favicon.ico remain unchanged; owner-machine paths do not.
secret = re.compile(r'\bBearer\s+[A-Za-z0-9._~+/=-]{24,}|\bsk-[A-Za-z0-9_-]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----')
for file in PUBLIC.rglob('*'):
    if not file.is_file():
        continue
    text = file.read_text(encoding='utf-8', errors='strict')
    assert '\x00' not in text and not secret.search(text), f'Credential-shaped content in {file.name}'
    assert '/Users/' not in text and '/home/' not in text and '/private/tmp/claude-' not in text and '/var/folders/' not in text, f'Owner-machine path in {file.name}'
assert (OUT / replay_name).read_bytes() == original_replay_bytes
print(json.dumps({key: summary[key] for key in ['schema', 'newFirst', 'repairNew', 'knownFinal', 'scopeFinal', 'assessmentCalls',
                                               'usageEstimateUsd', 'latestCitationChecks', 'currentPublishedCitationChecks', 'publicationReplay']}, ensure_ascii=False))
