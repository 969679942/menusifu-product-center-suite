"""Render already-downloaded evidence without running tests."""
import html,json,pathlib,sys
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def escaped(value):return html.escape(str(value))
def render(folder):
    folder=pathlib.Path(folder);analysis=read(folder/'analysis.json')
    allure_audit=read(folder/'allure-audit.json') if (folder/'allure-audit.json').exists() else {'status':'incomplete','reason':'allure-audit-missing'}
    ledgers=list((folder/'business').glob('*/evidence-ledger.json'))
    ledger={'cases':[case for file in ledgers for case in read(file).get('cases',[])]}
    audit=read(folder/'receipt-audit.json') if (folder/'receipt-audit.json').exists() else {'cases':[]}
    statuses={c['caseId']:c['status'] for c in audit['cases']}
    accepted=bool(analysis.get('businessPassAuthority'))
    rows=[]
    for case in ledger['cases']:
        receipts=case.get('runtimeEvidence',{}).get('assertionReceipts',[])
        raw=escaped(json.dumps(receipts,ensure_ascii=False,indent=2))
        rows.append(f"<tr><td>{escaped(case['caseId'])}</td><td>{escaped(case.get('playwrightStatus'))}</td><td>{escaped(statuses.get(case['caseId'],'incomplete'))}</td><td><details><summary>查看期望值、实际值与观察来源</summary><pre>{raw}</pre></details></td></tr>")
    business=str(analysis.get('kind','')).startswith('governed-business-')
    full_regression=analysis.get('kind')=='governed-business-full-regression'
    verified=accepted if business else analysis.get('actionRequired')=='none'
    title=('业务执行与收据验证通过' if business else '基础合同与报告验证通过') if verified else '本次验证尚有待处理项'
    color='#087f5b' if verified else '#b45309'
    pass_label='执行与证据通过' if business else '基础合同通过'
    fail_label='业务执行失败' if business else '基础合同失败'
    scope=('商品中心 seasoning 全量回归：82 条用例按单店与多店执行上下文分两批顺序执行；每批独立认证、预检、业务收据和清理。' if full_regression else '固定范围：调味下发记录查询和调味列表页面读取。本次未造数；变更清理不适用。') if business else '本次只验证基础合同或报告集成，不执行真实业务用例，不改变已有业务通过资格。'
    allure_link=f'<a href="{escaped(analysis["buildUrl"])}allure/">查看 Jenkins Allure 报告</a>' if (folder/'allure-audit.json').exists() else ''
    doc=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品中心 Jenkins 验证</title>
<style>body{{font:16px/1.65 "Microsoft YaHei",sans-serif;background:#f5f7fa;color:#172b4d;margin:0}}main{{max-width:1100px;margin:36px auto;padding:32px;background:white;border-radius:16px}}h1{{margin:0;color:{color}}}.meta{{color:#52616b;overflow-wrap:anywhere}}.stats{{display:flex;gap:32px;margin:24px 0}}.stat{{background:#f3f6f9;border-radius:10px;padding:16px 28px}}.stat b{{font-size:30px;display:block}}table{{width:100%;border-collapse:collapse}}th,td{{padding:12px;text-align:left;border-bottom:1px solid #dfe5ed;vertical-align:top}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-width:570px}}a{{color:#185abc}}summary{{cursor:pointer}}</style>
<main><h1>{title}</h1><p class="meta">商品中心 · 本机 AI / Git / Jenkins / TAP 标准收据</p>
<p><a href="{escaped(analysis['buildUrl'])}">Jenkins 构建 #{analysis['buildNumber']}</a> · {escaped(analysis['jenkinsResult'])}</p>
<p class="meta">Git SHA：{escaped(analysis['gitSha'])}<br>身份核验：{escaped(analysis['identityVerified'])} · 执行完整：{escaped(analysis.get('executionComplete',False))}</p>
<p><b>Allure 审计：{escaped(str(allure_audit.get('status','incomplete')).upper())}</b> · {escaped(allure_audit.get('reason') or allure_audit.get('selection',{{}}).get('reason') or '无')}</p>
<div class="stats"><div class="stat"><b>{len(ledger['cases'])}</b>真实业务用例</div><div class="stat"><b>{analysis.get('passed',0)}</b>{pass_label}</div><div class="stat"><b>{analysis.get('failed',0)}</b>{fail_label}</div><div class="stat"><b>{sum(s!='complete' for s in statuses.values())}</b>收据缺口</div></div>
<p>{scope} 合同测试与业务用例分别统计。{allure_link}</p>
<table><thead><tr><th>用例</th><th>执行</th><th>标准收据</th><th>断言证据</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<p class="meta">本报告仅消费本次构建下载的原始收据，不创建或补造运行结果。缺案、重复断言、缺少期望/实际观测或 SHA 不匹配均阻断正式接受。</p></main></html>'''
    path=folder/'report.html';path.write_text(doc,encoding='utf-8');return path
if __name__=='__main__':print(render(sys.argv[1]))
