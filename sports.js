// Cloudflare Pages Function: /api/sports?date=YYYY-MM-DD
// NHL / NBA / NFL / PGA Tour. Public ESPN scoreboard endpoints.
// This function is read-only and does not touch your Supabase database.
const FEEDS={
 nhl:'hockey/nhl',nba:'basketball/nba',nfl:'football/nfl',pga:'golf/pga'
};
const ALLOWED=/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const localDay=(iso)=>{
 try{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
 const parts=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
 catch{return '';}
};
function scoreOf(c){
 const v=c?.score;
 if(v==null)return null;
 if(typeof v==='object')return v.displayValue??v.value??null;
 return String(v);
}
function normalizeGame(event){
 const comp=event?.competitions?.[0]||{};
 const sides=comp.competitors||[];
 const away=sides.find(c=>c.homeAway==='away')||sides[1]||{};
 const home=sides.find(c=>c.homeAway==='home')||sides[0]||{};
 const type=comp.status?.type||event.status?.type||{};
 const state=type.completed?'final':type.state==='in'?'live':'upcoming';
 const date=event.date||comp.date||'';
 const rawOdds=Array.isArray(comp.odds)?comp.odds[0]:null;
 const ml=rawOdds?.awayTeamOdds?.moneyLine??rawOdds?.awayTeamOdds?.moneyline??null;
 const mh=rawOdds?.homeTeamOdds?.moneyLine??rawOdds?.homeTeamOdds?.moneyline??null;
 const cleanMoney=x=>{
  const candidate=typeof x==='object'&&x!==null?(x.value??x.displayValue??null):x;
  return candidate!=null&&candidate!==''&&Number.isFinite(Number(candidate))?Number(candidate):null;
 };
 const odds=rawOdds?{
  awayMoneyline:cleanMoney(ml),homeMoneyline:cleanMoney(mh),
  details:rawOdds.details||'',overUnder:rawOdds.overUnder??null,
  provider:rawOdds.provider?.name||rawOdds.provider?.displayName||''
 }:null;
 return {odds,date,state,away:away.team?.abbreviation||away.team?.shortDisplayName||'Away',
   home:home.team?.abbreviation||home.team?.shortDisplayName||'Home',
   awayScore:scoreOf(away),homeScore:scoreOf(home),detail:type.shortDetail||type.detail||''};
}
function normalizePga(event){
 const comp=event?.competitions?.[0]||{},type=comp.status?.type||event.status?.type||{};
 const entries=(comp.competitors||[]).slice();
 entries.sort((a,b)=>{
  const av=Number(a.order||a.curatedRank?.current||999),bv=Number(b.order||b.curatedRank?.current||999);
  return av-bv;
 });
 const leaders=entries.slice(0,3).filter(x=>x.athlete?.displayName||x.athlete?.shortName).map(x=>({
  name:x.athlete?.shortName||x.athlete?.displayName,
  score:String(x.score?.displayValue??x.score??x.statistics?.find(s=>s.name==='scoreToPar')?.displayValue??'')
 }));
 return {name:event.name||event.shortName||'PGA Tour',
  detail:type.shortDetail||type.detail||event.status?.type?.description||'Tournament update',leaders,
  state:type.completed?'final':type.state==='in'?'live':'upcoming',date:event.date||''};
}
// Fallback for upcoming-game odds missing from the undocumented ESPN scoreboard.
// ESPN's public Core endpoint may return a list of odds item references or a direct object.
// It is not guaranteed to have a line for every event, market, or region.
function cleanMoney(v){
 const x=typeof v==='object'&&v!==null?(v.value??v.displayValue??null):v;
 return x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
}
function parseOddsObject(odd){
 if(!odd||typeof odd!=='object')return null;
 const away=odd.awayTeamOdds||odd.awayOdds||{};
 const home=odd.homeTeamOdds||odd.homeOdds||{};
 const moneyAway=cleanMoney(away.moneyLine??away.moneyline??away.american);
 const moneyHome=cleanMoney(home.moneyLine??home.moneyline??home.american);
 const result={awayMoneyline:moneyAway,homeMoneyline:moneyHome,
  details:odd.details||odd.spread?.displayValue||'',overUnder:odd.overUnder??null,
  provider:odd.provider?.name||odd.provider?.displayName||''};
 return moneyAway!==null||moneyHome!==null||result.details||result.overUnder!=null?result:null;
}
async function safeJson(url,timeoutMs=2200){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
 try{const res=await fetch(url,{headers:{Accept:'application/json'},signal:ctl.signal,cf:{cacheTtl:300,cacheEverything:true}});return res.ok?await res.json():null;}
 catch{return null;}finally{clearTimeout(timer);}
}
async function lookupCoreOdds(id,event){
 const leaguePath=FEEDS[id];if(!leaguePath)return null;
 const [sport,league]=leaguePath.split('/');
 const comp=event?.competitions?.[0];if(!comp)return null;
 const eventId=encodeURIComponent(event.id||''),compId=encodeURIComponent(comp.id||event.id||'');
 if(!eventId||!compId)return null;
 const url=`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${eventId}/competitions/${compId}/odds?limit=3`;
 const data=await safeJson(url);
 if(!data)return null;
 const direct=parseOddsObject(data);if(direct)return direct;
 const refs=(Array.isArray(data.items)?data.items:[]).slice(0,2);
 for(const item of refs){
  if(!item||typeof item!=='object')continue;
  const inline=parseOddsObject(item);if(inline)return inline;
  const ref=typeof item.$ref==='string'?item.$ref.replace('sports.core.api.espn.pvt','sports.core.api.espn.com'):'';
  if(!ref.startsWith('https://sports.core.api.espn.com/'))continue;
  const detailed=await safeJson(ref);
  const parsed=parseOddsObject(detailed);if(parsed)return parsed;
 }
 return null;
}
async function fetchLeague(id,date){
 const path=FEEDS[id];
 const params=id==='pga'?'':`?dates=${date.replaceAll('-','')}&limit=100`;
 const url=`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard${params}`;
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  let response;
  try{response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal,cf:{cacheTtl:180,cacheEverything:true}});}
  finally{clearTimeout(timeout);}
  if(!response.ok)throw new Error('Upstream status '+response.status);
  const json=await response.json();
  const events=Array.isArray(json.events)?json.events:[];
  if(id==='pga'){
   const relevant=events.filter(e=>e.status?.type?.state==='in'||e.competitions?.[0]?.status?.type?.state==='in');
   const chosen=(relevant.length?relevant:events).slice(0,1).map(normalizePga);
   return {games:chosen};
  }
  const todayEvents=events.filter(e=>e.date&&localDay(e.date)===date);
  const games=todayEvents.map(normalizeGame);
  // Try secondary ESPN Core lines for the first six upcoming games lacking odds.
  // No synthetic price is ever inserted; show 'Odds unavailable' in the UI otherwise.
  if(id!=='pga'){
   const candidates=todayEvents.map((event,i)=>({event,i})).filter(({event,i})=>
     games[i].state==='upcoming'&&!parseOddsObject(games[i].odds)).slice(0,6);
   await Promise.all(candidates.map(async({event,i})=>{
    const published=await lookupCoreOdds(id,event);
    if(published)games[i].odds=published;
   }));
  }
  return {games};
 }catch(err){console.error('Sports wire feed failed',id,err.message);return {games:[],error:'unavailable'};}
}
export async function onRequestGet({request}){
 const d=new URL(request.url).searchParams.get('date')||'';
 if(!ALLOWED.test(d)||Number.isNaN(Date.parse(d)))return Response.json({error:'Use date=YYYY-MM-DD'}, {status:400});
 const ids=Object.keys(FEEDS);
 const results=await Promise.all(ids.map(id=>fetchLeague(id,d)));
 return Response.json({date:d,leagues:Object.fromEntries(ids.map((id,i)=>[id,results[i]]))},
  {headers:{'Cache-Control':'public, max-age=180'}});
}
