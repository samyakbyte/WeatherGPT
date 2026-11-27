from pathlib import Path
import json,re
r=Path(__file__).resolve().parents[1];cases=[]
old=[]
for name in ['assistant-1000-cases.json','diverse-1000-cases.json','extra-200.json','new-1000-cases.json']:
 old+=json.loads((r/'tests'/name).read_text(encoding='utf-8-sig'))
norm=lambda s:re.sub(r'[^\w\s]','',s.lower()).strip()
known={norm(x.get('question',x.get('q',''))) for x in old};seen=set()
def add(q,patterns,group='forecast',topic='metric'):
 assert norm(q) not in known and norm(q) not in seen,q
 seen.add(norm(q));cases.append(dict(id=len(cases)+1,question=q,requires=patterns,group=group,topic=topic,place=None))
times=['tomorrow at 1 AM','tomorrow at 5 AM','tomorrow at 8 AM','tomorrow at 10 AM','tomorrow at noon','tomorrow at 2 PM','tomorrow at 4 PM','tomorrow at 6 PM','tomorrow at 7 PM','tomorrow at 11 PM']
templates=[
('temperature','I need the air temperature {t} before choosing clothes.'),
('temperature','Our rehearsal needs a temperature check {t}.'),
('temperature','Tell me how hot the air will be {t} for the journey.'),
('feels','Please read apparent temperature {t} for my departure.'),
('feels','I care about the feels-like value {t} while waiting outside.'),
('feels','What apparent temperature should I plan around {t}?'),
('humidity','Read relative humidity {t} before my outdoor session.'),
('humidity','My workshop is outdoors; what humidity is forecast {t}?'),
('humidity','Could you report the humidity percentage {t} for this area?'),
('cloud','Give cloud cover {t} before I photograph the skyline.'),
('cloud','How cloudy is the sky predicted to be {t} for my drawing?'),
('cloud','I need the cloud percentage {t} while planning a photo.'),
('uv','Check ultraviolet index {t} before the outdoor lesson.'),
('uv','Read the forecast UV index {t} for the playground visit.'),
('uv','For an outdoor shift, what UV index is predicted {t}?'),
('visibility','Check visibility {t} before my journey to rehearsal.'),
('visibility','What distance visibility is expected {t} for the hill view?'),
('visibility','I need a visibility value {t} before setting up the camera.'),
('rain','Is a folding umbrella useful {t} for the uncovered route?'),
('rain','Give precipitation probability {t} before I carry my documents.'),
('rain','My paper drawings must stay dry; what rain chance is forecast {t}?'),
('temperature','Could you give a temperature value {t} for the queue outside?'),
('feels','How warm will it feel {t} at the selected map location?'),
('humidity','I want the relative-humidity figure {t} for the current city.'),
('cloud','Read the cloud-cover forecast {t} for my photography plan.'),
('uv','What ultraviolet value appears {t} for this city?'),
('visibility','Please report visibility {t} for the selected map point.'),
('rain','Should rain gear come with me {t} for the walk to tuition?'),
('temperature','For the hour {t}, show the temperature with units.'),
('feels','Give the feels-like estimate {t} before I head to the bus stop.')]
for kind,tpl in templates:
 for t in times:
  value={'temperature':'41' if '7 PM' in t else '22','feels':'46' if '7 PM' in t else '27','humidity':r'65\s*%','cloud':r'83\s*%' if '6 PM' in t else r'79\s*%' if '7 PM' in t else r'31\s*%','uv':r'uv index is 6(?:\.0)?\b' if '4 PM' in t else r'uv index is 9(?:\.0)?\b' if 'noon' in t else r'uv index is 4(?:\.0)?\b','visibility':r'5(?:\.0)? km' if '6 PM' in t else r'8(?:\.0)? km' if '7 PM' in t else r'10(?:\.0)? km','rain':r'73\s*%'}[kind]
  add(tpl.format(t=t),[value],kind)
crops=['wheat','rice','maize','cotton','mustard','soybean','sugarcane','tomato','potato','paddy']
farm=['I grow {c}; start with the weather now and explain field precautions.', 'What weather-based irrigation precautions suit my {c} plot today?', 'Before harvesting {c}, explain the current weather and its limits.', 'For spraying {c}, give weather precautions without a chemical dose.', 'My {c} field needs a current-weather summary followed by cautions.', 'I am preparing {c} irrigation; what weather evidence should I review?', 'Help me understand harvest precautions for {c} using current conditions.', 'Explain spraying precautions for {c} without prescribing a product.', 'For my {c} crop, show current conditions before any field advice.', 'What does the present weather mean for precautions on my {c} farm?']
for tpl in farm:
 for c in crops:add(tpl.format(c=c),['29','crop|field'], 'crop')
helpqs=[('ph','Can a rainwater pH measurement establish drinking-water safety?', ['pH','not|cannot']),('soil','Can weather measure soil moisture below the surface?', ['soil','not|cannot']),('medical','Can you diagnose an illness using the humidity reading?', ['medical','cannot']),('dose','Can you prescribe a pesticide dose using wind speed alone?', ['dose','cannot']),('records','How can I correct a saved pH sample date?', ['record|sample','not']),('farm','Where can I rename my saved farm and edit its coordinates?', ['farm','not']),('settings','Where can I switch wind units and temperature units?', ['Settings']),('radar','Explain what recent radar frames can actually tell me.', ['RainViewer']),('history','Can you retrieve historical weather from last summer?', ['historical','not']),('evidence','Can you invent a confidence score for the forecast?', ['confidence','not']),('probability','Does rain probability mean the fraction of my field that gets wet?', ['probability','not']),('missing','Does missing wind data mean calm conditions?', ['missing','not']),('external','Could you email the forecast to my class group?', ['cannot','not']),('exact','Can you guarantee that my doorstep will stay dry?', ['cannot','forecast']),('comparison','Compare three cities by humidity next month.', ['cannot','comparison']),('water','Does rainwater pH identify every pollutant in stored water?', ['pH','not']),('timestamp','What does the model timestamp identify in this app?', ['model','timestamp']),('offline','Can the forecast update while offline with no cached data?', ['missing|unavailable','not']),('sensor','Can you measure grain moisture without a field sensor?', ['grain','not']),('cloud','Does cloud cover prove the exact rain amount on my field?', ['model','not'])]
contexts=['I am planning a college outing.', 'My family needs to plan a short trip.', 'I have an outdoor volunteer shift.', 'We are arranging a community event.', 'I am preparing a field notebook.', 'My team needs to understand the limits.', 'I am checking before making a decision.', 'We need to explain this to our class.', 'I am reviewing the information on this screen.', 'I need to understand the evidence first.']
for group,q,patterns in helpqs:
 for context in contexts:add(context+' '+q,patterns,'help-'+group,'help')
assert len(cases)==600
(r/'tests/additional-600-cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding='utf-8')
s=(r/'tests/run-new-1000.js').read_text(encoding='utf-8').replace('new-1000-cases.json','additional-600-cases.json').replace('NEW-1000-RESULTS.json','ADDITIONAL-600-RESULTS.json')
(r/'tests/run-additional-600.js').write_text(s,encoding='utf-8')
print('600 unique texts checked against',len(old),'prior cases')
