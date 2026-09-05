"""Single-job transport. Local AI consumes evidence; this script does not impersonate AI."""
import argparse, hashlib, json, os, pathlib, subprocess, time, uuid
import xml.etree.ElementTree as ET
from urllib.parse import quote
import requests

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
            delay = min(60, int(response.headers.get('Retry-After', delay)))
        except (requests.ConnectionError, requests.Timeout):
            pass
        write(OUT / 'retry.json', {'operation':'GET','attempt':attempt+1,'retryDelay':delay,'time':time.time()})
        if delay: time.sleep(delay)
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
    for name in ['GIT_SHA','REQUEST_ID']:
        item=ET.SubElement(params,'hudson.model.StringParameterDefinition')
        ET.SubElement(item,'name').text=name
        ET.SubElement(item,'defaultValue').text=''
        ET.SubElement(item,'trim').text='true'
    ET.SubElement(props,'org.jenkinsci.plugins.workflow.job.properties.DisableConcurrentBuildsJobProperty')
    desired=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    post(JOB_URL+'config.xml',data=desired)
    actual=ET.fromstring(get(JOB_URL+'config.xml').content)
    assert actual.find('definition/script').text==definition.find('script').text
    print(json.dumps({'configuredJob':JOB,'verified':True}))

def parameters(item):
    return {p['name']:p.get('value') for action in item.get('actions',[]) for p in action.get('parameters',[])}

def reconcile(state):
    query='number,url,building,result,actions[parameters[name,value]]'
    builds=get(JOB_URL+'api/json',params={'tree':'builds['+query+']{0,100}'}).json()['builds']
    for build in builds:
        if parameters(build).get('REQUEST_ID')==state['requestId']:
            state.update(buildNumber=build['number'],buildUrl=build['url'],status='running' if build['building'] else 'finished')
            write(STATE,state);return True
    for item in get(BASE+'/queue/api/json').json()['items']:
        if item.get('task',{}).get('url')==JOB_URL and parameters(item).get('REQUEST_ID')==state['requestId']:
            state.update(queueUrl=BASE+'/queue/item/'+str(item['id'])+'/',status='queued')
            write(STATE,state);return True
    return False

def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()

def submit():
    if STATE.exists():
        previous=read(STATE)
        if previous['status'] not in ['analyzed']:
            if reconcile(previous) or previous.get('queueUrl'):
                print(json.dumps(previous));return
            if previous['status']=='submitting':
                raise RuntimeError('Uncertain submission is not replayed; reconcile checkpoint/server')
    sha=git('rev-parse','HEAD')
    git('push','origin','HEAD:master')
    if git('ls-remote','origin','refs/heads/master').split()[0]!=sha:
        raise RuntimeError('Remote SHA differs; build not triggered')
    state={'schemaVersion':1,'jobName':JOB,'gitSha':sha,'requestId':str(uuid.uuid4()),'status':'submitting'}
    write(STATE,state)
    result=post(JOB_URL+'buildWithParameters',data={'GIT_SHA':sha,'REQUEST_ID':state['requestId']})
    state.update(queueUrl=result.headers['Location'],status='queued')
    write(STATE,state);print(json.dumps(state))

def poll():
    state=read(STATE)
    if state['status']=='analyzed': print(json.dumps(state));return
    if not state.get('buildNumber'): reconcile(state)
    if not state.get('buildNumber'):
        if not state.get('queueUrl'): print(json.dumps(state));return
        q=get(state['queueUrl']+'api/json').json()
        if q.get('cancelled'): raise RuntimeError('Queue cancelled')
        if not q.get('executable'): print(json.dumps(state));return
        state.update(buildNumber=q['executable']['number'],buildUrl=q['executable']['url'],status='running');write(STATE,state)
    info=get(state['buildUrl']+'api/json').json()
    if info['building']: print(json.dumps(state));return
    folder=OUT/('build-'+str(state['buildNumber']))
    folder.mkdir(exist_ok=True)
    downloaded=[]
    for artifact in info['artifacts']:
        rel=artifact['relativePath']
        if not rel.startswith('suite-src/output/ci/') or '..' in pathlib.PurePosixPath(rel).parts:continue
        dest=folder / rel.removeprefix('suite-src/output/ci/')
        dest.parent.mkdir(parents=True,exist_ok=True)
        content=get(state['buildUrl']+'artifact/'+quote(rel,safe='/')).content
        dest.write_bytes(content)
        downloaded.append({'path':str(dest.relative_to(folder)),'sha256':hashlib.sha256(content).hexdigest()})
    envelopePath=folder/'result-envelope.json'
    envelope=read(envelopePath) if envelopePath.exists() else None
    errors=[]
    if not envelope: errors.append('result-envelope-missing')
    else:
        if envelope['gitSha']!=state['gitSha']:errors.append('git-sha-mismatch')
        if str(envelope['buildNumber'])!=str(state['buildNumber']):errors.append('build-number-mismatch')
        if envelope['requestId']!=state['requestId']:errors.append('request-id-mismatch')
        if sorted(envelope['selectedCaseIds'])!=sorted(envelope['terminalCaseIds']):errors.append('selection-drift-or-incomplete')
    analysis={'schemaVersion':1,'jobName':JOB,'buildNumber':state['buildNumber'],'buildUrl':state['buildUrl'],
      'gitSha':state['gitSha'],'jenkinsResult':info['result'],'identityVerified':not errors,'errors':errors,
      'kind':envelope.get('kind') if envelope else None,'businessPassAuthority':False,'artifactCount':len(downloaded),
      'passed':envelope.get('passed',0) if envelope else 0,'failed':envelope.get('failed',0) if envelope else 0,
      'skipped':envelope.get('skipped',0) if envelope else 0,
      'actionRequired':'none' if not errors and info['result']=='SUCCESS' else 'ai-evidence-review'}
    write(folder/'artifact-hashes.json',downloaded)
    write(folder/'analysis.json',analysis)
    state.update(status='analyzed',analysisPath=str(folder/'analysis.json'));write(STATE,state)
    print(json.dumps(analysis,ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['configure','submit','poll'])
    globals()[parser.parse_args().action]()
