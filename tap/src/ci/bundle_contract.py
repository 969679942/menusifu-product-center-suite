"""Validate a downloaded package without executing any downloaded content."""
import hashlib,json,pathlib
def validate_bundle(folder,expected):
    folder=pathlib.Path(folder);manifest=folder/'bundle-manifest.json'
    if not manifest.exists():return ['bundle-manifest-missing'] if expected.get('requireManifest') else []
    value=json.loads(manifest.read_text(encoding='utf-8-sig'));errors=[];seen=set()
    for key in ['gitSha','buildNumber','requestId']:
        if str(value.get(key))!=str(expected.get(key)):errors.append('bundle-'+key+'-mismatch')
    if expected.get('intentId') and str(value.get('intentId'))!=str(expected.get('intentId')):errors.append('bundle-intentId-mismatch')
    if expected.get('runScope') and str(value.get('runScope'))!=str(expected.get('runScope')):errors.append('bundle-runScope-mismatch')
    for item in value.get('artifacts',[]):
        rel=item['path'];p=pathlib.PurePosixPath(rel)
        if p.is_absolute() or '..' in p.parts or '\\' in rel or ':' in rel or rel in seen:
            errors.append('bundle-path-invalid');continue
        seen.add(rel);file=folder/pathlib.Path(*p.parts)
        if not file.is_file() or not file.resolve().is_relative_to(folder.resolve()):errors.append('bundle-file-missing');continue
        data=file.read_bytes()
        if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:errors.append('bundle-content-mismatch')
    if not seen:errors.append('bundle-empty')
    if value.get('reportStatus')=='incomplete':errors.append('allure-evidence-incomplete')
    return sorted(set(errors))
