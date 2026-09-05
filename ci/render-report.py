"""Render already-downloaded evidence without running tests."""
import html,json,pathlib,sys
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def escaped(value):return html.escape(str(value))
def render(folder):
    folder=pathlib.Path(folder);analysis=read(folder/'analysis.json')
    ledgers=list((folder/'business').glob('*/evidence-ledger.json'))
    ledger=read(ledgers[0]) if len(ledgers)==1 else {'cases':[]}
    audit=read(folder/'receipt-audit.json') if (folder/'receipt-audit.json').exists() else {'cases':[]}
    statuses={c['caseId']:c['status'] for c in audit['cases']}
    accepted=bool(analysis.get('businessPassAuthority'))
    rows=[]
    for case in ledger['cases']:
        receipts=case.get('runtimeEvidence',{}).get('assertionReceipts',[])
        raw=escaped(json.dumps(receipts,ensure_ascii=False,indent=2))
        rows.append(f"<tr><td>{escaped(case['caseId'])}</td><td>{escaped(case.get('playwrightStatus'))}</td><td>{escaped(statuses.get(case['caseId'],'incomplete'))}</td><td><details><summary>查看期望值、实际值与观察来源</summary><pre>{raw}</pre></details></td></tr>")
    title='闭环验证通过' if accepted else '闭环验证尚有待处理项'
    color='#087f5b' if accepted else '#b45309'
    doc=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品中心 Jenkins 验证</title>
<style>body{{font:16px/1.65 "Microsoft YaHei",sans-serif;background:#f5f7fa;color:#172b4d;margin:0}}main{{max-width:1100px;margin:36px auto;padding:32px;background:white;border-radius:16px}}h1{{margin:0;color:{color}}}.meta{{color:#52616b;overflow-wrap:anywhere}}.stats{{display:flex;gap:32px;margin:24px 0}}.stat{{background:#f3f6f9;border-radius:10px;padding:16px 28px}}.stat b{{font-size:30px;display:block}}table{{width:100%;border-collapse:collapse}}th,td{{padding:12px;text-align:left;border-bottom:1px solid #dfe5ed;vertical-align:top}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-width:570px}}a{{color:#185abc}}summary{{cursor:pointer}}</style>
<main><h1>{title}</h1><p class="meta">商品中心 · 本机 AI / Git / Jenkins / TAP 标准收据</p>
<p><a href="{escaped(analysis['buildUrl'])}">Jenkins 构建 #{analysis['buildNumber']}</a> · {escaped(analysis['jenkinsResult'])}</p>
<p class="meta">Git SHA：{escaped(analysis['gitSha'])}<br>身份核验：{escaped(analysis['identityVerified'])} · 执行完整：{escaped(analysis.get('executionComplete',False))}</p>
<div class="stats"><div class="stat"><b>{len(ledger['cases'])}</b>真实业务用例</div><div class="stat"><b>{analysis.get('passed',0)}</b>执行与证据通过</div><div class="stat"><b>{analysis.get('failed',0)}</b>业务执行失败</div><div class="stat"><b>{sum(s!='complete' for s in statuses.values())}</b>收据缺口</div></div>
<p>固定范围：调味下发记录查询和调味列表页面读取。本次未造数；变更清理不适用。合同测试与业务用例分别统计。</p>
<table><thead><tr><th>用例</th><th>执行</th><th>标准收据</th><th>断言证据</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<p class="meta">本报告仅消费本次构建下载的原始收据，不创建或补造运行结果。缺案、重复断言、缺少期望/实际观测或 SHA 不匹配均阻断正式接受。</p></main></html>'''
    path=folder/'report.html';path.write_text(doc,encoding='utf-8');return path
if __name__=='__main__':print(render(sys.argv[1]))
