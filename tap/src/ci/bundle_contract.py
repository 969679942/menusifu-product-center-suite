"""Validate a downloaded package without executing any downloaded content."""
import hashlib,json,pathlib,re
def validate_bundle(folder,expected):
    folder=pathlib.Path(folder);manifest=folder/'bundle-manifest.json'
    if not manifest.exists():return ['bundle-manifest-missing'] if expected.get('requireManifest') else []
    try:value=json.loads(manifest.read_text(encoding='utf-8-sig'))
    except (OSError,ValueError):return ['bundle-manifest-invalid']
    if not isinstance(value,dict):return ['bundle-manifest-invalid']
    errors=[];seen=set()
    for key in ['gitSha','buildNumber','requestId']:
        if str(value.get(key))!=str(expected.get(key)):errors.append('bundle-'+key+'-mismatch')
    if expected.get('intentId') and str(value.get('intentId'))!=str(expected.get('intentId')):errors.append('bundle-intentId-mismatch')
    if expected.get('runScope') and str(value.get('runScope'))!=str(expected.get('runScope')):errors.append('bundle-runScope-mismatch')
    artifacts=value.get('artifacts',[])
    if not isinstance(artifacts,list):return ['bundle-artifacts-invalid']
    for item in artifacts:
        if not isinstance(item,dict) or not isinstance(item.get('path'),str):
            errors.append('bundle-artifact-invalid');continue
        rel=item['path'];p=pathlib.PurePosixPath(rel)
        if p.is_absolute() or '..' in p.parts or '\\' in rel or ':' in rel or rel in seen:
            errors.append('bundle-path-invalid');continue
        seen.add(rel)
        policy=item.get('policy','required')
        if policy not in ['required','optional','excluded','generated-after-download']:
            errors.append('bundle-artifact-policy-invalid');continue
        if policy in ['excluded','generated-after-download']:
            if not str(item.get('reason','')).strip():errors.append('bundle-exclusion-reason-missing')
            continue
        file=folder/pathlib.Path(*p.parts)
        if not file.is_file() or not file.resolve().is_relative_to(folder.resolve()):
            if policy=='required':
                errors.append('bundle-file-missing');errors.append('bundle-file-missing:'+rel)
            continue
        if not isinstance(item.get('size'),int) or item['size']<0 or not isinstance(item.get('sha256'),str) or not re.fullmatch('[0-9a-f]{64}',item['sha256']):
            errors.append('bundle-artifact-metadata-invalid');continue
        data=file.read_bytes()
        if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:errors.append('bundle-content-mismatch')
    if not seen:errors.append('bundle-empty')
    if value.get('reportStatus')=='incomplete':errors.append('allure-evidence-incomplete')
    return sorted(set(errors))
