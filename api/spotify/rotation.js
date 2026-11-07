/* Single new endpoint to keep Vercel's function count low. Reuses existing session. */
var lib=require('../_lib');
var url=require('url');
var WEATHER='https://api.open-meteo.com/v1/forecast?latitude=33.24&longitude=-111.85&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FPhoenix&forecast_days=5';
function error(data){var e=data&&data.error;return(typeof e==='string'?e:e&&e.message)||'Spotify could not complete this request.'}
function out(res,err,status,data){if(err)return lib.json(res,502,{error:'Connection to service failed.'});lib.json(res,status,data||{error:'Service returned no data.'})}
module.exports=function(req,res){
 var method=(req.method||'').toUpperCase();
 var query=url.parse(req.url,true).query||{},kind=query.type;
 if(method==='GET'&&kind==='weather'){
  if(lib.memoryRateLimit(req,'rotation-weather',20,60))return lib.json(res,429,{error:'Too many weather checks.'});
  return lib.request(WEATHER,{timeout:8000},function(e,s,d){out(res,e,s,d)});
 }
 if(!lib.cookie(req,'spotify_session'))return lib.json(res,401,{error:'Open SETUP and pair Spotify first.'});
 if(lib.memoryRateLimit(req,'rotation-'+(method==='POST'?'action':'lookup'),method==='POST'?25:35,60))return lib.json(res,429,{error:'Too many requests. Try again shortly.'});
 lib.getSession(req,res,function(err,session){if(err||!session)return lib.json(res,401,{error:'Session expired. Please pair again.'});
  var cfg=lib.config(req);
  lib.spotifyToken(cfg,'grant_type=refresh_token&refresh_token='+encodeURIComponent(session.refresh_token),function(te,ts,token){
   if(te||ts!==200||!token||!token.access_token)return lib.json(res,401,{error:'Spotify authorization expired. Pair again.'});
   lib.updateRefreshToken(res,session,token);
   var auth={Authorization:'Bearer '+token.access_token};
   if(method==='GET'&&kind==='search'){
    var q=typeof query.q==='string'?query.q.trim().slice(0,90):'';
    if(!q)return lib.json(res,400,{error:'Enter a song or artist.'});
    return lib.request('https://api.spotify.com/v1/search?type=track&limit=12&q='+encodeURIComponent(q),{headers:auth,timeout:10000},function(e,s,d){if(e||s!==200)return lib.json(res,s||502,{error:error(d)});lib.json(res,200,{tracks:((d.tracks||{}).items||[]).map(function(t){return{id:t.id,uri:t.uri,name:t.name,artists:t.artists,album:{images:t.album&&t.album.images||[]}}})})});
   }
   if(method==='GET'&&kind==='queue'){
    return lib.request('https://api.spotify.com/v1/me/player/queue',{headers:auth,timeout:10000},function(e,s,d){if(e||s!==200)return lib.json(res,s||502,{error:error(d)});lib.json(res,200,{queue:(d.queue||[]).map(function(t){return{id:t.id,uri:t.uri,name:t.name,artists:t.artists,album:{images:t.album&&t.album.images||[]}}})})});
   }
   if(method!=='POST')return lib.json(res,400,{error:'Unknown request.'});
   lib.readBody(req,function(raw){if(raw.length>1024)return lib.json(res,413,{error:'Request too large.'});var body;try{body=JSON.parse(raw)}catch(e){return lib.json(res,400,{error:'Invalid JSON.'})}
    if(!body||!/^spotify:track:[A-Za-z0-9]{22}$/.test(body.uri||'')||['play','add'].indexOf(body.action)<0)return lib.json(res,400,{error:'Invalid track or action.'});
    var add=body.action==='add',path=add?'/me/player/queue?uri='+encodeURIComponent(body.uri):'/me/player/play';
    var payload=add?null:JSON.stringify({uris:[body.uri]});
    var headers={Authorization:auth.Authorization,'Content-Length':payload?Buffer.byteLength(payload):0};if(payload)headers['Content-Type']='application/json';
    lib.request('https://api.spotify.com/v1'+path,{method:add?'POST':'PUT',headers:headers,body:payload,timeout:10000},function(e,s,d){if(e)return lib.json(res,502,{error:'Spotify is unreachable.'});if(s===200||s===204)return lib.json(res,200,{ok:true});return lib.json(res,s||502,{error:error(d)})});
   });
  });
 });
};
