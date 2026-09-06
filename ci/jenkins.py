"""Single-job transport. Local AI consumes evidence; this script does not impersonate AI."""
import argparse, hashlib, json, os, pathlib, re, subprocess, tempfile, time, uuid
import xml.etree.ElementTree as ET
from urllib.parse import quote
import requests
import sys
import importlib.util
from email.utils import parsedate_to_datetime
sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'jenkins'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://192.168.1.50:8081'
JOB = 'menusifu-product-center-suite'
JOB_URL = BASE + '/job/' + JOB + '/'
STATE = OUT / 'checkpoint.json'
SESSION = requests.Session()
SESSION.auth = (os.environ['SUITE_JENKINS_USER'], os.environ['SUITE_JENKINS_TOKEN'])
SESSION.trust_env = False

def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def get(url, **kwargs):
    if not url.startswith(BASE + '/'):
        raise ValueError('Jenkins URL outside authorized server')
    for attempt, delay in enumerate([5, 15, 30, 60, 0]):
        try:
            response = SESSION.get(url, timeout=25, **kwargs)
            if response.status_code not in [429, 500, 502, 503, 504]:
                response.raise_for_status()
                return response
            retry_after=response.headers.get('Retry-After')
            if retry_after:
                try: delay=max(0,int(retry_after))
                except ValueError: delay=max(0,int(parsedate_to_datetime(retry_after).timestamp()-time.time()))
        except (requests.ConnectionError, requests.Timeout):
            pass
        write(OUT / 'retry.json', {'operation':'GET','attempt':attempt+1,'retryDelay':delay,'time':time.time()})
        while delay>0:
            interval=min(delay,60);time.sleep(interval);delay-=interval
    raise RuntimeError('Read retries exhausted; checkpoint retained')

def post(url, **kwargs):
    if url not in [JOB_URL+'config.xml', JOB_URL+'buildWithParameters']:
        raise ValueError('Mutation outside dedicated job denied')
    crumb = get(BASE+'/crumbIssuer/api/json').json()
    response = SESSION.post(url, headers={crumb['crumbRequestField']:crumb['crumb']}, timeout=30, **kwargs)
    response.raise_for_status()
    return response

def configure():
    old=get(JOB_URL+'config.xml').content
    (OUT/'job-config-before.xml').write_bytes(old)
    root=ET.fromstring(old)
    definition=root.find('definition')
    definition.clear()
    definition.set('class','org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition')
    definition.set('plugin','workflow-cps')
    ET.SubElement(definition,'script').text=(ROOT/'Jenkinsfile').read_text(encoding='utf-8-sig')
    ET.SubElement(definition,'sandbox').text='true'
    props=root.find('properties')
    if props is None: props=ET.SubElement(root,'properties')
    for tag in ['hudson.model.ParametersDefinitionProperty','org.jenkinsci.plugins.workflow.job.properties.DisableConcurrentBuildsJobProperty']:
        existing=props.find(tag)
        if existing is not None: props.remove(existing)
    params=ET.SubElement(ET.SubElement(props,'hudson.model.ParametersDefinitionProperty'),'parameterDefinitions')
    for name in ['GIT_SHA','REQUEST_ID','INTENT_ID','RUN_SCOPE','MC_RUNTIME_ENV']:
        item=ET.SubElement(params,'hudson.model.PasswordParameterDefinition' if name=='MC_RUNTIME_ENV' else 'hudson.model.StringParameterDefinition')
        ET.SubElement(item,'name').text=name
        ET.SubElement(item,'defaultValue').text=''
        ET.SubElement(item,'trim').text='true'
    ET.SubElement(props,'org.jenkinsci.plugins.workflow.job.properties.DisableConcurrentBuildsJobProperty')
    desired=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    if ET.canonicalize(old.decode('utf-8'))==ET.canonicalize(desired.decode('utf-8')):
        print(json.dumps({'configuredJob':JOB,'verified':True,'unchanged':True}));return
    post(JOB_URL+'config.xml',data=desired)
    actual=ET.fromstring(get(JOB_URL+'config.xml').content)
    assert actual.find('definition/script').text==definition.find('script').text
    print(json.dumps({'configuredJob':JOB,'verified':True}))

def parameters(item):
    return {p['name']:p.get('value') for action in item.get('actions',[]) for p in action.get('parameters',[])}

def reconcile(state, state_path=None):
    state_path = state_path or STATE
    query='number,url,building,result,actions[parameters[name,value]]'
    builds=get(JOB_URL+'api/json',params={'tree':'builds['+query+']{0,100}'}).json()['builds']
    for build in builds:
        if parameters(build).get('REQUEST_ID')==state['requestId']:
            state.update(buildNumber=build['number'],buildUrl=build['url'],status='running' if build['building'] else 'finished')
            write(state_path,state);return True
    for item in get(BASE+'/queue/api/json').json()['items']:
        if item.get('task',{}).get('url')==JOB_URL and parameters(item).get('REQUEST_ID')==state['requestId']:
            state.update(queueUrl=BASE+'/queue/item/'+str(item['id'])+'/',status='queued')
            write(state_path,state);return True
    return False

def git(*args):
    for attempt, delay in enumerate([5,15,30,60,0]):
        try:
            return subprocess.check_output(['git',*args],cwd=ROOT,text=True,timeout=40,
                env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'Never'}).strip()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            write(OUT/'git-retry.json',{'operation':args[0],'attempt':attempt+1,'delay':delay})
            if args[0] not in ['ls-remote','push'] or not delay: raise
            time.sleep(delay)

def submit(scope='contracts'):
    if STATE.exists():
        previous=read(STATE)
        if previous['status'] not in ['analyzed']:
            if reconcile(previous) or previous.get('queueUrl'):
                print(json.dumps(previous));return
            if previous['status']=='submitting':
                raise RuntimeError('Uncertain submission is not replayed; reconcile checkpoint/server')
    sha=git('rev-parse','HEAD')
    if STATE.exists() and previous.get('status')=='analyzed' and previous.get('gitSha')==sha and previous.get('runScope','contracts')==scope:
        print(json.dumps({'status':'already-analyzed','checkpoint':str(STATE)}));return
    # Successful push updates this tracking ref. An exact checkout is safe even if another commit follows.
    if git('rev-parse','refs/remotes/origin/master') != sha:
        git('push','origin','HEAD:master')
    if git('rev-parse','refs/remotes/origin/master')!=sha:
        raise RuntimeError('Remote SHA differs; build not triggered')
    state={'schemaVersion':1,'jobName':JOB,'gitSha':sha,'requestId':str(uuid.uuid4()),'intentId':str(uuid.uuid4()),
        'trigger':'explicit-local-submit','status':'submitting','runScope':scope,'createdAt':time.time()}
    write(STATE,state)
    write(OUT/'intents'/(state['intentId']+'.json'),{
        'schemaVersion':1,'intentId':state['intentId'],'jobName':JOB,'gitSha':sha,
        'requestId':state['requestId'],'runScope':scope,'trigger':state['trigger'],
        'createdAt':state['createdAt'],'status':'submitted'
    })
    data={'GIT_SHA':sha,'REQUEST_ID':state['requestId'],'INTENT_ID':state['intentId'],'RUN_SCOPE':scope}
    if scope in ['pilot','full-regression']:
        secret_file=pathlib.Path(r'D:\Menusifu\Merchant Center\.secrets\runtime.env')
        data['MC_RUNTIME_ENV']=secret_file.read_text(encoding='utf-8-sig')
    result=post(JOB_URL+'buildWithParameters',data=data)
    state.update(queueUrl=result.headers['Location'],status='queued')
    write(STATE,state);print(json.dumps(state))

def poll(state_path=None):
    state_path = state_path or STATE
    if not state_path.exists():
        print(json.dumps({'status':'no-pending-submission'}));return
    state=read(state_path)
    if state['status']=='analyzed': print(json.dumps(state));return
    if not state.get('buildNumber'): reconcile(state, state_path)
    if not state.get('buildNumber'):
        if not state.get('queueUrl'): print(json.dumps(state));return
        q=get(state['queueUrl']+'api/json').json()
        if q.get('cancelled'): raise RuntimeError('Queue cancelled')
        if not q.get('executable'): print(json.dumps(state));return
        state.update(buildNumber=q['executable']['number'],buildUrl=q['executable']['url'],status='running');write(state_path,state)
    info=get(state['buildUrl']+'api/json').json()
    if info['building']: print(json.dumps(state));return
    folder=OUT/('build-'+str(state['buildNumber']))
    folder.mkdir(exist_ok=True)
    downloaded=[]
    with tempfile.TemporaryDirectory(prefix='download-'+str(state['buildNumber'])+'-',dir=OUT) as staging:
        stage=pathlib.Path(staging)
        for artifact in info['artifacts']:
            rel=artifact['relativePath']
            if not rel.startswith('suite-src/output/ci/') or '..' in pathlib.PurePosixPath(rel).parts or '\\' in rel or ':' in rel:continue
            # Playwright's raw test-results tree can contain deeply nested trace
            # resources.  Business ledgers, diagnostics and Allure results are
            # the governed AI evidence; the raw duplicate tree is optional and
            # can exceed Windows MAX_PATH during local collection.
            if '/test-results/' in f'/{rel}' or '/.playwright-artifacts-' in f'/{rel}':
                continue
            dest=stage / rel.removeprefix('suite-src/output/ci/')
            dest.parent.mkdir(parents=True,exist_ok=True)
            content=get(state['buildUrl']+'artifact/'+quote(rel,safe='/')).content
            dest.write_bytes(content)
            downloaded.append({'path':dest.relative_to(stage).as_posix(),'sha256':hashlib.sha256(content).hexdigest()})
        spec=importlib.util.spec_from_file_location('bundle_contract',ROOT/'tap/src/ci/bundle_contract.py')
        validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
        bundle_errors=validator.validate_bundle(stage,{**state,'requireManifest':state.get('runScope') in ['pilot','reports'] and int(state['buildNumber'])>=35})
        for item in downloaded:
            dest=folder/item['path'];dest.parent.mkdir(parents=True,exist_ok=True)
            (stage/item['path']).replace(dest)
    envelopePath=folder/('pilot-envelope.json' if state.get('runScope')=='pilot' else 'result-envelope.json')
    envelope=read(envelopePath) if envelopePath.exists() else None
    errors=list(bundle_errors)
    if not envelope: errors.append('result-envelope-missing')
    else:
        expected={k:state[k] for k in ['gitSha','buildNumber','requestId']}
        errors+=json.loads(subprocess.check_output(['node',str(ROOT/'tap/src/ci/transport-contract.cjs'),str(envelopePath),json.dumps(expected)],text=True))
        if state.get('runScope') in ['pilot','full-regression']:
            receipts=list((folder/'business').glob('*/evidence-ledger.json'))
            expected_receipt_dirs=1 if state.get('runScope')=='pilot' else 2
            if len(receipts)!=expected_receipt_dirs:
                errors.append('standard-business-ledger-missing')
            else:
                audits=[]
                for ledger in receipts:
                    verify=subprocess.run(['node',str(ROOT/'tap/node_modules/tsx/dist/cli.mjs'),str(ROOT/'tap/scripts/verify-ci-business-receipts.ts'),
                        '--ledger='+str(ledger),'--contract='+str(ledger.with_name('contract.json'))],capture_output=True,text=True,encoding='utf-8')
                    if verify.returncode!=0: errors.append('standard-assertion-receipts-incomplete')
                    if verify.stdout: audits.append(json.loads(verify.stdout))
                if audits:
                    write(folder/'receipt-audit.json',{'status':'complete' if all(a.get('status')=='complete' for a in audits) else 'incomplete',
                        'selected':sum(a.get('selected',0) for a in audits),'received':sum(a.get('received',0) for a in audits),
                        'cases':[case for audit in audits for case in audit.get('cases',[])]})
                if state.get('runScope')=='full-regression' and (not envelope.get('receiptAudit') or envelope['receiptAudit'].get('status')!='complete'):
                    errors.append('standard-assertion-receipts-incomplete')
    identity_errors=[e for e in errors if e in ['gitSha-mismatch','buildNumber-mismatch','requestId-mismatch','bundle-gitSha-mismatch','bundle-buildNumber-mismatch','bundle-requestId-mismatch','envelope-or-identity-missing','result-envelope-missing']]
    analysis={'schemaVersion':1,'jobName':JOB,'buildNumber':state['buildNumber'],'buildUrl':state['buildUrl'],
      'gitSha':state['gitSha'],'requestId':state['requestId'],'runScope':state.get('runScope'),'jenkinsResult':info['result'],'identityVerified':not identity_errors,'executionComplete':not errors,'errors':errors,
      'kind':envelope.get('kind') if envelope else None,'businessPassAuthority':bool(envelope and envelope.get('publicReceiptAccepted') and not errors),'artifactCount':len(downloaded),
      'passed':envelope.get('passed',0) if envelope else 0,'failed':envelope.get('failed',0) if envelope else 0,
      'skipped':envelope.get('skipped',0) if envelope else 0,
      'failureCategories':envelope.get('runReport',{}).get('failureCategories',[]) if envelope and envelope.get('runReport') else [],
      'actionRequired':'none' if not errors and info['result']=='SUCCESS' else 'ai-evidence-review'}
    write(folder/'artifact-hashes.json',downloaded)
    write(folder/'analysis.json',analysis)
    spec=importlib.util.spec_from_file_location('ci_report',ROOT/'ci/render-report.py')
    renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
    renderer.render(folder)
    state.update(status='analyzed',analysisPath=str(folder/'analysis.json'));write(state_path,state)
    print(json.dumps(analysis,ensure_ascii=False))

def discover_builds(first_build):
    builds=[]
    for offset in range(0, 100000, 100):
        query='builds[number,building,result,actions[parameters[name,value]]]{'+str(offset)+','+str(offset+100)+'}'
        page=get(JOB_URL+'api/json',params={'tree':query}).json()['builds']
        for item in page:
            if item['number'] < first_build: continue
            params=parameters(item)
            sha=params.get('GIT_SHA'); request_id=params.get('REQUEST_ID'); scope=params.get('RUN_SCOPE')
            # Never persist parameter dumps; the same API response contains the password parameter.
            builds.append({'buildNumber':item['number'],'building':item['building'],'result':item.get('result'),
                'gitSha':sha if isinstance(sha,str) and re.fullmatch('[0-9a-f]{40}',sha) else None,
                'requestId':request_id if isinstance(request_id,str) and re.fullmatch('[a-zA-Z0-9-]{1,80}',request_id) else None,
                'runScope':scope if scope in ['pilot','full-regression','contracts','reports'] else None})
        if len(page)<100 or any(item['number']<first_build for item in page): return builds
    raise RuntimeError('Build discovery pagination limit reached; no builds silently discarded')

def watch():
    policy=read(ROOT/'ci/watch-policy.json')
    if policy['jobName']!=JOB: raise ValueError('Watch policy outside dedicated job')
    if STATE.exists() and read(STATE)['status']!='analyzed': poll()
    builds=discover_builds(policy['firstBuildNumber'])
    # Historical discovery is diagnostic-only by default.  A build enters the
    # AI queue only when it was explicitly registered by a local checkpoint or
    # listed in the watch policy; this prevents old full-regression runs from
    # being replayed after a worker restart.
    if not policy.get('autoDiscoverHistorical',False):
        registered={int(n) for n in policy.get('registeredBuilds',[])}
        active=read(STATE) if STATE.exists() else {}
        activeRequest=active.get('requestId') if active.get('status') not in ['analyzed'] else None
        local=[]
        for build in builds:
            if build['buildNumber'] in registered or (activeRequest and build['requestId']==activeRequest):
                local.append(build)
        builds=local
    analyses={}; reviews={}
    for build in builds:
        folder=OUT/('build-'+str(build['buildNumber']))
        for name,dest in [('analysis.json',analyses),('ai-review.json',reviews)]:
            if (folder/name).exists(): dest[build['buildNumber']]=read(folder/name)
    plan=json.loads(subprocess.check_output(['node',str(ROOT/'tap/src/ci/build-watch-contract.cjs')],
        input=json.dumps({'firstBuildNumber':policy['firstBuildNumber'],'builds':builds,'analyses':analyses,'reviews':reviews}),text=True))
    by_number={b['buildNumber']:b for b in builds}
    snapshot={'schemaVersion':1,'jobName':JOB,'checkedAt':time.time(),'builds':builds,'actions':plan}
    write(OUT/'watch-checkpoint.json',snapshot)
    for item in plan:
        build=by_number[item['buildNumber']]
        if item['action']=='collect' and build['runScope'] is not None:
            folder=OUT/('build-'+str(build['buildNumber']))
            state={**build,'schemaVersion':1,'jobName':JOB,'status':'finished',
                'buildUrl':JOB_URL+str(build['buildNumber'])+'/'}
            write(folder/'checkpoint.json',state)
            poll(folder/'checkpoint.json')
            item['action']='review'
        elif not build['building'] and build['runScope'] is None:
            item['action']='diagnose-identity'
        write(OUT/'watch-checkpoint.json',snapshot)
    print(json.dumps({'jobName':JOB,'pendingAI':[x for x in plan if x['action'] not in ['done','wait']],
        'running':[x['buildNumber'] for x in plan if x['action']=='wait'],
        'reviewed':[x['buildNumber'] for x in plan if x['action']=='done']},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['configure','submit','poll','watch'])
    parser.add_argument('--scope',choices=['contracts','pilot','full-regression','reports'],default='contracts')
    args=parser.parse_args()
    # Serialize local callers before reading or changing the request checkpoint.
    with open(OUT/'transport.lock','a+b') as lock:
        if lock.tell()==0:lock.write(b'1');lock.flush()
        lock.seek(0)
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.action=='submit': submit(args.scope)
        else: globals()[args.action]()
