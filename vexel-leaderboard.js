/* VEXEL GAMES LEADERBOARD SDK
 * Otomatis dipasang oleh Cloudflare Worker saat game diunggah.
 * Game cukup mengirim event: window.dispatchEvent(new CustomEvent('vexel:gameover',{detail:{score: SCORE}}));
 */
(function(){
  'use strict';
  if(window.VexelLeaderboard) return;
  const script=document.currentScript;
  const API=(script&&script.dataset.api)||'https://vexel-games-uploader.vexelkang.workers.dev';
  let GAME_ID=(script&&script.dataset.gameId)||location.pathname.split('/').filter(Boolean)[1]||'game';
  const TOKEN_KEY='vexel_player_session';
  let initialized=false, submitting=false, lastSubmitted=null, profile=null;
  const $=s=>document.querySelector(s);
  const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch(_){return ''}};
  const esc=s=>String(s??'');
  async function request(path,options={}){
    const headers=Object.assign({},options.headers||{});
    const t=token(); if(t) headers.Authorization='Bearer '+t;
    const r=await fetch(API+path,Object.assign({},options,{headers,cache:'no-store'}));
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||'Permintaan leaderboard gagal ('+r.status+').');
    return d;
  }
  async function loadProfile(){
    if(!token()){profile=null;return null}
    const d=await request('/auth/me');
    profile=d.user||null; return profile;
  }
  function ensurePanel(){
    let panel=$('#vexel-leaderboard-panel');
    if(panel) return panel;
    panel=document.createElement('section'); panel.id='vexel-leaderboard-panel';
    panel.innerHTML='<button type="button" id="vexel-lb-toggle" aria-expanded="false">🏆 Peringkat</button><div id="vexel-lb-content" hidden><strong>LEADERBOARD</strong><div id="vexel-lb-player"></div><ol id="vexel-lb-list"><li>Memuat...</li></ol><small id="vexel-lb-status" role="status"></small></div>';
    const style=document.createElement('style');
    style.textContent='#vexel-leaderboard-panel{position:fixed;z-index:2147483000;right:10px;bottom:10px;font:13px system-ui;color:#fff}#vexel-lb-toggle{border:0;border-radius:999px;padding:10px 15px;background:#263b80;color:#fff;font-weight:800;box-shadow:0 3px 14px #0005}#vexel-lb-content{width:min(270px,calc(100vw - 24px));max-height:45vh;overflow:auto;margin-top:7px;padding:12px;border-radius:14px;background:#111a38ee;box-shadow:0 5px 25px #0006;backdrop-filter:blur(8px)}#vexel-lb-content strong{display:block;margin-bottom:6px}#vexel-lb-list{padding-left:22px;margin:8px 0}#vexel-lb-list li{padding:3px 0}#vexel-lb-status{display:block;opacity:.8}';
    document.head.appendChild(style); document.body.appendChild(panel);
    $('#vexel-lb-toggle').addEventListener('click',()=>{
      const box=$('#vexel-lb-content'),open=box.hidden;
      box.hidden=!open;$('#vexel-lb-toggle').setAttribute('aria-expanded',String(open));
      if(open) refresh();
    });
    return panel;
  }
  async function refresh(){
    const list=$('#vexel-lb-list'),status=$('#vexel-lb-status'),player=$('#vexel-lb-player');
    try{
      const [board,me]=await Promise.all([
        request('/leaderboard?gameId='+encodeURIComponent(GAME_ID)),
        loadProfile().catch(()=>null)
      ]);
      if(list) list.replaceChildren();
      const rankings=(board.rankings||[]).slice(0,10);
      if(list){
        if(!rankings.length){const li=document.createElement('li');li.textContent='Belum ada skor';list.appendChild(li)}
        rankings.forEach((entry,i)=>{const li=document.createElement('li');li.textContent=(entry.playerName||'Pemain')+' — '+Number(entry.score||0).toLocaleString('id-ID');list.appendChild(li)});
      }
      if(player) player.textContent=me?'Login sebagai: '+me.nickname:'Login untuk mengirim skor.';
      if(status) status.textContent='10 skor terbaik · '+GAME_ID;
    }catch(e){if(status)status.textContent=e.message}
    // Dukungan panel bawaan game lama yang memiliki #lb dan #ms.
    const oldList=$('#lb'),oldStatus=$('#ms');
    if(oldList&&list) oldList.innerHTML=list.innerHTML;
  }
  async function submitScore(value){
    const score=Number(value);
    if(!Number.isSafeInteger(score)||score<0||score>100000000) throw new Error('Nilai skor tidak valid.');
    if(submitting) return {success:false,reason:'submitting'};
    if(lastSubmitted===score) return {success:true,duplicate:true};
    submitting=true;
    const status=$('#vexel-lb-status')||$('#ms');
    if(status)status.textContent='Memeriksa akun dan mengirim skor...';
    try{
      if(!token()) throw new Error('Silakan login ke VEXEL GAMES untuk menyimpan skor.');
      const me=await loadProfile();
      if(!me||!me.nickname) throw new Error('Nickname akun belum tersedia. Lengkapi profil pemain.');
      const result=await request('/leaderboard/submit',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gameId:GAME_ID,score})
      });
      lastSubmitted=score;
      if(status)status.textContent='Skor tersimpan sebagai '+result.playerName+' · rekor '+Number(result.bestScore||0).toLocaleString('id-ID');
      await refresh();
      const oldStatus=$('#ms'); if(oldStatus)oldStatus.textContent='Skor berhasil dikirim sebagai '+result.playerName+' (rekor: '+Number(result.bestScore||0).toLocaleString('id-ID')+').';
      return result;
    }catch(e){if(status)status.textContent=e.message;const oldStatus=$('#ms');if(oldStatus)oldStatus.textContent=e.message;throw e}
    finally{submitting=false}
  }
  function init(options={}){
    if(initialized) return api;
    initialized=true;
    if(options.gameId) GAME_ID=options.gameId;
    ensurePanel();
    refresh();
    return api;
  }
  const api={init,refresh,submitScore,getPlayer:loadProfile,get gameId(){return GAME_ID}};
  window.VexelLeaderboard=api;
  window.submitVexelScore=submitScore;
  window.addEventListener('vexel:gameover',e=>{
    const detail=e.detail||{};
    submitScore(detail.score).catch(()=>{});
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>init(),{once:true});
  else init();
})();