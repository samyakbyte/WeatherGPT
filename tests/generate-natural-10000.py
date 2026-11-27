from pathlib import Path
import json,re
r=Path(__file__).resolve().parents[1]
base=[]
for line in (r/'tests/everyday-language.txt').read_text(encoding='utf-8').strip().splitlines():
 topic,when,lang,q=line.split('|');base.append((topic,lang,q))
places=[('Jaipur','जयपुर'),('Delhi','दिल्ली'),('Mumbai','मुंबई'),('Pune','पुणे'),('Lucknow','लखनऊ'),('Bhopal','भोपाल'),('Patna','पटना'),('Indore','इंदौर'),('Chennai','चेन्नई'),('Kolkata','कोलकाता')]
windows=[('today','आज','aaj',0),('tomorrow','कल','kal',1),('the day after tomorrow','परसों','parso',2),('today evening','आज शाम','aaj shaam',0),('tomorrow morning','कल सुबह','kal subah',1),('tomorrow evening','कल शाम','kal shaam',1),('the day after tomorrow morning','परसों सुबह','parso subah',2),('the day after tomorrow evening','परसों शाम','parso shaam',2),('tomorrow afternoon','कल दोपहर','kal dopahar',1),('today night','आज रात','aaj raat',0)]
prior=[]
for name in ['assistant-1000-cases','diverse-1000-cases','extra-200','new-1000-cases','additional-600-cases']:
 prior+=json.loads((r/'tests'/f'{name}.json').read_text(encoding='utf-8-sig'))
norm=lambda q:re.sub(r'[^\w\s]','',q.lower()).strip()
seen={norm(x.get('question',x.get('q',''))) for x in prior}
rows=[]
for bi,(topic,lang,original) in enumerate(base):
 for city,hiCity in places:
  for en,hi,roman,offset in windows:
   script=bool(re.search('[\u0900-\u097f]',original));q=original
   if script:
    q=re.sub(r'परसों|कल|आज|अभी',hi,q,count=1)
    if q==original and not re.search(r'परसों|कल|आज|अभी',original):q=hi+' '+q
    q=hiCity+' में '+q
   elif lang=='hi':
    q=re.sub(r'\b(?:parson|parso|kal|aaj|abhi)\b',roman,q,count=1,flags=re.I)
    if q==original and not re.search(r'\b(?:parson|parso|kal|aaj|abhi)\b',original,re.I):q=roman+' '+q
    q=city+' mein '+q
   else:
    q=re.sub(r'\b(?:the day after tomorrow|day after tomorrow|tomorrow|today|right now)\b',en,q,count=1,flags=re.I)
    if q==original and not re.search(r'\b(?:tomorrow|today|right now)\b',original,re.I):q=en.capitalize()+', '+q
    q='In '+city+', '+q
   key=norm(q)
   if key in seen:raise ValueError('duplicate '+q)
   seen.add(key);rows.append(dict(id=len(rows)+1,baseQuestionId=bi+1,question=q,topic=topic,language=lang,place=city,day=offset,window=en))
assert len(rows)==10000
(r/'tests/natural-10000-cases.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(len(rows),'distinct question strings; 100 authored cores, ten cities and ten relative time windows')
