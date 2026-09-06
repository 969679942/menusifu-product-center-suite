"""Exact, scoped edits returned by a model; no model-generated shell commands are executed."""
import pathlib
ALLOWED_SUFFIXES={'.ts','.js','.cjs','.py','.ps1','.groovy'}
def source_path(root,name,prefixes):
    rel=pathlib.PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name:raise ValueError('repair-path-invalid')
    if any(p in ['node_modules','.git','.secrets','output','allure-results','test-results'] for p in rel.parts):raise ValueError('repair-private-or-generated-path')
    if not any(name.startswith(prefix) for prefix in prefixes) or rel.suffix not in ALLOWED_SUFFIXES:raise ValueError('repair-outside-source-scope')
    target=pathlib.Path(root).joinpath(*rel.parts).resolve()
    if not target.is_relative_to(pathlib.Path(root).resolve()):raise ValueError('repair-symlink-escape')
    return target

def prepare_changes(root,changes,prefixes):
    if not changes:raise ValueError('repair-empty-change-set')
    pending={}
    for change in changes:
        target=source_path(root,change['path'],prefixes)
        existing=pending.get(target,target.read_text(encoding='utf-8-sig') if target.exists() else None)
        before=change['before'];after=change['after']
        if existing is None:
            if before or not after:raise ValueError('new-file-contract-invalid')
            pending[target]=after
        else:
            if not before or existing.count(before)!=1:raise ValueError('repair-preimage-not-unique')
            pending[target]=existing.replace(before,after,1)
    return [{'path':p.relative_to(pathlib.Path(root).resolve()).as_posix(),
             'before':p.read_text(encoding='utf-8-sig') if p.exists() else None,'after':value} for p,value in pending.items()]

def apply_plan(root,plan,prefixes):
    pending=[]
    for item in plan:
        target=source_path(root,item['path'],prefixes)
        current=target.read_text(encoding='utf-8-sig') if target.exists() else None
        if current==item['after']:continue  # Already written before a process interruption.
        if current!=item['before']:raise ValueError('repair-intervening-edit')
        pending.append((target,item['after']))
    for target,value in pending:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value,encoding='utf-8')
    return [item['path'] for item in plan]

def apply_changes(root,changes,prefixes):
    return apply_plan(root,prepare_changes(root,changes,prefixes),prefixes)

def verified_followup(detail,build,review):
    return (build.get('gitSha')==detail.get('commit') and build.get('requestId')==detail.get('followupRequestId')
        and build.get('intentId')==detail.get('followupIntentId')
        and build.get('runScope')==detail.get('verificationScope') and not build.get('building',True)
        and review.get('buildNumber')==build.get('buildNumber') and review.get('gitSha')==build.get('gitSha')
        and review.get('requestId')==build.get('requestId') and review.get('intentId')==build.get('intentId') and review.get('status')=='complete'
        and review.get('actionRequired')=='none' and bool(review.get('evidence'))
        and not detail.get('sourceSyncPending'))
