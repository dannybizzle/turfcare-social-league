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
  return {games:events.map(normalizeGame).filter(g=>g.date&&localDay(g.date)===date)};
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
