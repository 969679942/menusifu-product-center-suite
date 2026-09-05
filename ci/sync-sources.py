"""Plan/review source exports; never export private runtime data or overwrite intervening edits."""
import argparse, hashlib, json, pathlib, subprocess, os
ROOT=pathlib.Path(__file__).resolve().parent.parent
MAPPINGS={'tap':pathlib.Path(r'D:\Menusifu\Test Automation Platform'), 'projects/project-a':pathlib.Path(r'D:\Menusifu\Merchant Center')}
PLAN=ROOT/'output/jenkins/source-export-plan.json'
EXCLUDED={'node_modules','.git','.secrets','output','deliverables','test-results','allure-results'}
def digest(data):return hashlib.sha256(data).hexdigest()
def content(path):return path.read_bytes().replace(b'\r\n',b'\n')
def safe_source(target):
    for prefix,source in MAPPINGS.items():
        if target.startswith(prefix+'/'):
            rel=pathlib.PurePosixPath(target[len(prefix)+1:])
            if any(p in EXCLUDED for p in rel.parts) or '..' in rel.parts or ':' in str(rel) or rel.is_absolute():return None
            if 'adapters/test-automation-platform/reports/' in str(rel):return None
            if rel.name.startswith('.env') or 'auth-state' in rel.name or 'storage-state' in rel.name:return None
            # Generated catalogs must be rebuilt in the export checkout, where LF is enforced.
            if 'systems' in rel.parts and rel.name in {'adapters.json','manifest.json','recipes.json','rules.json','test-plan.json','classification-ledger.json','blocked-source-audit-queue.json'}:return None
            if rel.suffix not in {'.ts','.js','.cjs','.json','.md','.yml','.yaml','.py','.ps1'}:return None
            resolved=(source/pathlib.Path(*rel.parts)).resolve()
            if not resolved.is_relative_to(source.resolve()):return None
            return resolved
    return None
def secrets():
    p=pathlib.Path(r'D:\Menusifu\Merchant Center\.secrets\runtime.env')
    values=[]
    for line in p.read_text(encoding='utf-8-sig').splitlines():
        key,sep,value=line.partition('=')
        if sep and any(x in key for x in ['PASSWORD','TOKEN','SECRET']) and len(value)>5:values.append(value.encode())
    return values
def plan():
    changes=[];private=secrets()
    targets=set(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0'))
    for prefix,source in MAPPINGS.items():
        codeRoot=source if prefix=='tap' else source/'Merchant Center UITest'
        for directory,dirs,files in os.walk(codeRoot):
            dirs[:]=[d for d in dirs if d not in EXCLUDED]
            for name in files:
                if pathlib.Path(name).suffix in {'.ts','.js','.cjs'}:
                    targets.add(prefix+'/'+(pathlib.Path(directory)/name).relative_to(source).as_posix())
    for target in sorted(targets):
        source=safe_source(target)
        if not source or not source.is_file():continue
        incoming=content(source);existing=content(ROOT/target) if (ROOT/target).exists() else b''
        if incoming==existing:continue
        if any(value in incoming for value in private):raise RuntimeError('Private credential detected; export rejected: '+target)
        changes.append({'target':target,'source':str(source),'sourceHash':digest(incoming),'targetHash':digest(existing)})
    PLAN.parent.mkdir(parents=True,exist_ok=True);PLAN.write_text(json.dumps({'changes':changes},indent=2),encoding='utf-8')
    print(json.dumps({'plan':str(PLAN),'changedFileCount':len(changes),'targets':[c['target'] for c in changes]},ensure_ascii=True))
def apply():
    changes=json.loads(PLAN.read_text(encoding='utf-8'))['changes'];validated=[];private=secrets()
    for c in changes:
        source=safe_source(c['target'])
        if not source or str(source)!=c['source']:raise RuntimeError('Source mapping changed')
        incoming=content(source);target=ROOT/c['target']
        existing=content(target) if target.exists() else b''
        if digest(incoming)!=c['sourceHash'] or digest(existing)!=c['targetHash']:raise RuntimeError('Intervening edit; regenerate and review plan')
        if any(value in incoming for value in private):raise RuntimeError('Private credential detected')
        validated.append((target,incoming))
    for target,data in validated:
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    print(json.dumps({'exported':len(validated),'next':'Review Git diff and regenerate affected adapter catalogs before committing'}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['plan','apply']);globals()[p.parse_args().action]()
