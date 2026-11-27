#!/usr/bin/env python3
"""Ververs vacancies.js en img/ met actuele vacatures van swipe4work.nl.

Gebruik (vanuit de map van het prototype):
    python3 tools/build_vacancies.py            # standaard 48 vacatures
    python3 tools/build_vacancies.py 80         # meer vacatures (langere feed)
"""
import collections, html, json, os, random, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://www.swipe4work.nl'
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 48
UA = {'User-Agent': 'Mozilla/5.0 (prototype build script)'}

def get(url_path, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(BASE + url_path, headers=UA), timeout=60).read()
    return data if binary else data.decode()

# 1. alle vacatures staan als JSON in de zoekpagina
page = get('/vacatures/zoeken/')
blob = next(s for s in re.findall(r'<script[^>]*>(.*?)</script>', page, re.S) if len(s) > 100000)
allv = json.loads(blob)

# 2. verdeel over branches (gewichten ~ aandeel in aanbod, met minimum)
cats = collections.defaultdict(list)
for x in allv:
    if x['sph'] and x['sp']:
        cats[x['bl']].append(x)
weights = {c: max(3, round(TOTAL * len(v) / sum(len(i) for i in cats.values()))) for c, v in cats.items()}
random.seed(7)
seen, sel = set(), []
for c, n in weights.items():
    random.shuffle(cats[c])
    k = 0
    for x in cats[c]:
        if x['t'] in seen:
            continue
        seen.add(x['t']); sel.append(x); k += 1
        if k == n:
            break
random.shuffle(sel)
sel = sel[:TOTAL]

def clean(s):
    s = re.sub(r'<(/?)(h2|h3|p|ul|ol|li|strong|em|br)\b[^>]*>', r'<\1\2>', s)
    return re.sub(r'<(?!/?(h2|h3|p|ul|ol|li|strong|em|br)>)[^>]+>', '', s).strip()

# 3. detailpagina per vacature
out = []
for x in sel:
    try:
        h = get(x['u'])
    except Exception as e:
        print('mislukt', x['u'], e); continue
    intro = re.search(r'<div class=md>(.*?)</div></div></section>', h, re.S)
    body = re.search(r'<div data-variant=a>(.*?)</div><h2>In het kort</h2>', h, re.S)
    kort = re.search(r'<h2>In het kort</h2><ul>(.*?)</ul>', h, re.S)
    if not (intro and body):
        print('overgeslagen', x['u']); continue
    facts = {}
    for li in re.findall(r'<li>(.*?)</li>', kort.group(1) if kort else '', re.S):
        li = html.unescape(re.sub(r'<[^>]+>', '', li))
        if ':' in li:
            k, v = li.split(':', 1); facts[k.strip()] = v.strip()
    out.append(dict(id=x['id'], title=html.unescape(x['t']), cat=html.unescape(x['bl']), loc=x['l'], hours=x['hp'],
                    salary=html.unescape(x['sp']), img=os.path.basename(x['i']), intro=clean(intro.group(1)),
                    body=clean(body.group(1)), facts=facts, url=BASE + x['u']))

# 4. afbeeldingen + data wegschrijven
os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
srcs = {os.path.basename(x['i']): x['i'] for x in sel}
for name in {o['img'] for o in out}:
    p = os.path.join(ROOT, 'img', name)
    if not os.path.exists(p):
        open(p, 'wb').write(get(srcs[name], binary=True))
with open(os.path.join(ROOT, 'vacancies.js'), 'w') as f:
    f.write('window.VACANCIES=' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
print(len(out), 'vacatures', dict(collections.Counter(o['cat'] for o in out)))
